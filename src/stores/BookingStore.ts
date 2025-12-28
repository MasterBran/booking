import { makeAutoObservable, runInAction } from 'mobx'
import { v4 as uuidv4 } from 'uuid'
import {
  TimeSlot,
  SlotStatus,
  BookingRequest,
  BookingResponse,
  ApiErrorCode,
  ClientBookingState,
  ConcurrencyConfig
} from '../types'
import { BookingAPI } from '../services/BookingAPI'
import { WebSocketService } from '../services/WebSocketService'
import { GlobalEventBus } from '../services/GlobalEventBus'

/**
 * 预定系统核心状态管理
 * 处理高并发场景下的状态同步和冲突处理
 */
export class BookingStore {
  //  observable state
  slots: Map<string, TimeSlot> = new Map()
  isLoading: boolean = false
  error: string | null = null
  currentUser: { id: string; name: string } | null = null

  // 并发控制相关状态
  private clientState: ClientBookingState
  private config: ConcurrencyConfig = {
    maxPendingTime: 10000,      // 10秒超时
    retryAttempts: 3,
    retryDelay: 1000,
    lockTimeout: 30000,         // 30秒锁定超时
    enableOptimisticUpdate: true
  }

  // 依赖服务
  private api: BookingAPI
  private wsService: WebSocketService
  private globalEventBus: GlobalEventBus

  constructor(api: BookingAPI, wsService: WebSocketService) {
    makeAutoObservable(this)
    this.api = api
    this.wsService = wsService
    this.globalEventBus = GlobalEventBus.getInstance()

    // 初始化客户端状态
    this.clientState = {
      clientId: uuidv4(),
      userId: '',
      pendingBookings: new Map(),
      optimisticUpdates: new Map()
    }

    // 设置WebSocket事件监听
    this.setupWebSocketListeners()

    // 设置全局事件监听（用于跨页签同步）
    this.setupGlobalEventListeners()
  }

  /**
   * 设置当前用户
   */
  setCurrentUser(user: { id: string; name: string }) {
    this.currentUser = user
    this.clientState.userId = user.id
  }

  /**
   * 加载可用时间段
   */
  async loadSlots(resourceId?: string) {
    this.isLoading = true
    this.error = null

    try {
      const slots = await this.api.getAvailableSlots(resourceId)
      runInAction(() => {
        this.slots.clear()
        slots.forEach(slot => {
          this.slots.set(slot.id, slot)
        })
        this.isLoading = false
      })
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : '加载时间段失败'
        this.isLoading = false
      })
    }
  }

  /**
   * 预定时间段 - 核心并发处理逻辑（支持跨页签）
   */
  async bookSlot(slotId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[BookingStore] 开始预定: ${slotId} by ${this.currentUser?.id}`)

    if (!this.currentUser) {
      console.log(`[BookingStore] 用户未登录`)
      return { success: false, error: '用户未登录' }
    }

    const slot = this.slots.get(slotId)
    if (!slot) {
      console.log(`[BookingStore] 时间段不存在: ${slotId}`)
      return { success: false, error: '时间段不存在' }
    }

    if (slot.status !== SlotStatus.AVAILABLE) {
      console.log(`[BookingStore] 时间段不可预定: ${slotId} 状态=${slot.status}`)
      return { success: false, error: `时间段不可预定（状态：${slot.status}）` }
    }

    // 【重要】获取全局锁 - 这是防止跨页签并发的关键
    console.log(`[BookingStore] 尝试获取全局锁: ${slotId}`)
    const acquiredLock = this.globalEventBus.acquireLock(slotId, this.currentUser.id)
    if (!acquiredLock) {
      console.log(`[BookingStore] 获取全局锁失败: ${slotId}`)
      return {
        success: false,
        error: '该时间段正在被其他用户预定，请稍后重试'
      }
    }

    console.log(`[BookingStore] 获取全局锁成功: ${slotId}`)

    try {
      // 1. 乐观更新UI
      const optimisticSlot: TimeSlot = {
        ...slot,
        status: SlotStatus.LOCKED,
        lockedBy: this.currentUser.id,
        lockedAt: new Date().toISOString()
      }

      this.applyOptimisticUpdate(slotId, optimisticSlot)

      // 2. 发送预定请求
      const request: BookingRequest = {
        slotId,
        userId: this.currentUser.id,
        timestamp: new Date().toISOString(),
        clientId: this.clientState.clientId
      }

      console.log(`[BookingStore] 发送预定请求: ${slotId}`)
      const response = await this.api.bookSlot(request)
      console.log(`[BookingStore] 收到API响应: ${slotId} success=${response.success}`)

      if (response.success && response.slot) {
        console.log(`[BookingStore] 预定成功: ${slotId}`)
        // 3. 预定成功，更新状态
        runInAction(() => {
          this.slots.set(slotId, response.slot!)
          this.clearOptimisticUpdate(slotId)
          this.clientState.pendingBookings.delete(slotId)
        })

        // 【重要】预定成功后清理全局锁并广播
        this.globalEventBus.releaseLock(slotId, this.currentUser.id)
        this.globalEventBus.emit('booking_confirmed', {
          slotId,
          userId: this.currentUser.id,
          slot: response.slot
        })

        console.log(`[BookingStore] 预定流程完成: ${slotId}`)
        return { success: true }
      } else {
        console.log(`[BookingStore] 预定失败: ${slotId} - ${response.error?.message}`)
        // 4. 预定失败，回滚状态并释放锁
        this.handleBookingFailure(slotId, response)
        this.globalEventBus.releaseLock(slotId, this.currentUser.id)

        return {
          success: false,
          error: response.error?.message || '预定失败'
        }
      }
    } catch (err) {
      console.log(`[BookingStore] 预定异常: ${slotId} - ${err}`)
      // 5. 网络错误，回滚状态并释放锁
      this.handleBookingFailure(slotId, {
        success: false,
        error: {
          code: ApiErrorCode.TIMESTAMP_EXPIRED,
          message: err instanceof Error ? err.message : '网络错误'
        }
      })

      this.globalEventBus.releaseLock(slotId, this.currentUser.id)

      return {
        success: false,
        error: err instanceof Error ? err.message : '网络错误'
      }
    }
  }

  /**
   * 应用乐观更新
   */
  private applyOptimisticUpdate(slotId: string, optimisticSlot: TimeSlot) {
    // 更新本地状态
    this.slots.set(slotId, optimisticSlot)
    // 缓存乐观更新，用于回滚
    this.clientState.optimisticUpdates.set(slotId, optimisticSlot)

    // 记录待确认预定
    this.clientState.pendingBookings.set(slotId, {
      slotId,
      timestamp: new Date().toISOString(),
      status: 'pending'
    })

    // 设置超时回滚
    setTimeout(() => {
      const pending = this.clientState.pendingBookings.get(slotId)
      if (pending && pending.status === 'pending') {
        this.handleBookingTimeout(slotId)
      }
    }, this.config.maxPendingTime)
  }

  /**
   * 处理预定失败
   */
  private handleBookingFailure(slotId: string, response: BookingResponse) {
    const originalSlot = this.clientState.optimisticUpdates.get(slotId)

    if (originalSlot) {
      // 回滚到原始状态
      this.slots.set(slotId, originalSlot)
      this.clearOptimisticUpdate(slotId)
    }

    // 如果是并发冲突，显示具体信息
    if (response.conflict) {
      this.error = `该时间段已被 ${response.conflict.bookedBy} 于 ${new Date(response.conflict.bookedAt).toLocaleString()} 预定`
    }
  }

  /**
   * 处理预定超时
   */
  private handleBookingTimeout(slotId: string) {
    const originalSlot = this.clientState.optimisticUpdates.get(slotId)

    if (originalSlot) {
      // 超时回滚到可用状态
      const revertedSlot: TimeSlot = {
        ...originalSlot,
        status: SlotStatus.AVAILABLE,
        lockedBy: undefined,
        lockedAt: undefined
      }

      this.slots.set(slotId, revertedSlot)
      this.clearOptimisticUpdate(slotId)
      this.error = '预定超时，请重试'
    }
  }

  /**
   * 清除乐观更新缓存
   */
  private clearOptimisticUpdate(slotId: string) {
    this.clientState.optimisticUpdates.delete(slotId)
    this.clientState.pendingBookings.delete(slotId)
  }

  /**
   * 设置WebSocket监听器
   */
  private setupWebSocketListeners() {
    this.wsService.onSlotUpdate((updatedSlot: TimeSlot) => {
      runInAction(() => {
        // 如果是当前用户的预定被确认
        if (updatedSlot.status === SlotStatus.BOOKED &&
            updatedSlot.bookedBy === this.currentUser?.id) {
          this.clearOptimisticUpdate(updatedSlot.id)
        }

        // 如果是其他用户预定成功，更新状态
        if (updatedSlot.status === SlotStatus.BOOKED &&
            updatedSlot.bookedBy !== this.currentUser?.id) {
          // 清除可能存在的乐观更新
          this.clientState.optimisticUpdates.delete(updatedSlot.id)
        }

        this.slots.set(updatedSlot.id, updatedSlot)
      })
    })

    this.wsService.onConnectionChange((connected: boolean) => {
      if (!connected) {
        this.error = '实时连接已断开'
      } else {
        this.error = null
      }
    })
  }

  /**
   * 设置全局事件监听（用于跨页签同步）
   */
  private setupGlobalEventListeners() {
    // 监听锁获取事件
    this.globalEventBus.on('lock_acquired', (data: { slotId: string; userId: string }) => {
      console.log(`[BookingStore] 收到锁获取事件: ${data.slotId} by ${data.userId}`)
      if (data.userId !== this.currentUser?.id) {
        runInAction(() => {
          const slot = this.slots.get(data.slotId)
          if (slot && slot.status === SlotStatus.AVAILABLE) {
            // 其他页签获取了锁，更新UI
            const lockedSlot: TimeSlot = {
              ...slot,
              status: SlotStatus.LOCKED,
              lockedBy: data.userId,
              lockedAt: new Date().toISOString()
            }
            this.slots.set(data.slotId, lockedSlot)
            console.log(`[BookingStore] 更新时间段状态为锁定: ${data.slotId}`)
          }
        })
      }
    })

    // 监听锁释放事件
    this.globalEventBus.on('lock_released', (data: { slotId: string }) => {
      console.log(`[BookingStore] 收到锁释放事件: ${data.slotId}`)
      runInAction(() => {
        const slot = this.slots.get(data.slotId)
        if (slot && slot.status === SlotStatus.LOCKED) {
          // 锁被释放，恢复可用状态
          const availableSlot: TimeSlot = {
            ...slot,
            status: SlotStatus.AVAILABLE,
            lockedBy: undefined,
            lockedAt: undefined
          }
          this.slots.set(data.slotId, availableSlot)
          console.log(`[BookingStore] 恢复时间段为可用: ${data.slotId}`)
        }
      })
    })

    // 【新增】监听预定成功事件
    this.globalEventBus.on('booking_confirmed', (data: { slotId: string; userId: string; slot: TimeSlot }) => {
      console.log(`[BookingStore] 收到预定成功事件: ${data.slotId} by ${data.userId}`)
      if (data.userId !== this.currentUser?.id) {
        runInAction(() => {
          // 更新为已预定状态
          this.slots.set(data.slotId, data.slot)
          // 清除可能存在的乐观更新
          this.clientState.optimisticUpdates.delete(data.slotId)
          console.log(`[BookingStore] 更新时间段为已预定: ${data.slotId}`)
        })
      }
    })

    // 定期清理过期锁
    setInterval(() => {
      this.globalEventBus.cleanupLocks()
    }, 10000) // 每10秒清理一次
  }

  /**
   * 获取排序后的时间段列表
   */
  getSortedSlots(): TimeSlot[] {
    return Array.from(this.slots.values()).sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    })
  }

  /**
   * 按状态过滤时间段
   */
  getSlotsByStatus(status: SlotStatus): TimeSlot[] {
    return this.getSortedSlots().filter(slot => slot.status === status)
  }

  /**
   * 检查时间段是否被当前用户锁定
   */
  isSlotLockedByCurrentUser(slotId: string): boolean {
    const slot = this.slots.get(slotId)
    return slot?.lockedBy === this.currentUser?.id
  }

  /**
   * 检查是否有待处理的预定
   */
  hasPendingBookings(): boolean {
    return this.clientState.pendingBookings.size > 0
  }

  /**
   * 获取当前用户的待处理预定
   */
  getPendingBookings(): TimeSlot[] {
    const pendingIds = Array.from(this.clientState.pendingBookings.keys())
    return pendingIds
      .map(id => this.slots.get(id))
      .filter((slot): slot is TimeSlot => slot !== undefined)
  }

  /**
   * 重置错误状态
   */
  clearError() {
    this.error = null
  }

  /**
   * 取消所有待处理的预定（用户主动取消）
   */
  cancelAllPendingBookings() {
    this.clientState.pendingBookings.forEach((_, slotId) => {
      this.clearOptimisticUpdate(slotId)

      // 【修改】释放全局锁
      if (this.currentUser) {
        this.globalEventBus.releaseLock(slotId, this.currentUser.id)
        this.api.unlockSlot(slotId, this.currentUser.id)
      }
    })
  }
}
