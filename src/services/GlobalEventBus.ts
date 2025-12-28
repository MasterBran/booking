import { TimeSlot } from '../types'

/**
 * 简单粗暴的跨页签事件总线
 * 使用 BroadcastChannel + localStorage 实现
 */
export class GlobalEventBus {
  private static instance: GlobalEventBus | null = null
  private channel: BroadcastChannel | null = null
  private sessionId: string = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  private listeners: Map<string, Set<Function>> = new Map()

  // localStorage 键名
  private readonly LOCK_KEY = 'booking_locks'
  private readonly EVENT_KEY = 'booking_events'

  private constructor() {
    this.initChannel()
    this.setupStorageListener()
  }

  static getInstance(): GlobalEventBus {
    if (!GlobalEventBus.instance) {
      GlobalEventBus.instance = new GlobalEventBus()
    }
    return GlobalEventBus.instance
  }

  private initChannel() {
    try {
      this.channel = new BroadcastChannel('booking_bus')
      this.channel.onmessage = (event) => {
        const { type, data, from } = event.data
        if (from !== this.sessionId) {
          this.emitLocal(type, data)
        }
      }
    } catch (error) {
      console.warn('BroadcastChannel 不可用，使用 localStorage')
      this.channel = null
    }
  }

  private setupStorageListener() {
    window.addEventListener('storage', (event) => {
      if (event.key === this.EVENT_KEY && event.newValue) {
        try {
          const { type, data, from } = JSON.parse(event.newValue)
          if (from !== this.sessionId) {
            this.emitLocal(type, data)
          }
        } catch (error) {
          console.error('解析事件失败:', error)
        }
      }
    })
  }

  /**
   * 发送事件
   */
  private send(type: string, data: any) {
    const event = { type, data, from: this.sessionId }

    // 优先使用 BroadcastChannel
    if (this.channel) {
      this.channel.postMessage(event)
    }

    // 降级到 localStorage
    try {
      localStorage.setItem(this.EVENT_KEY, JSON.stringify(event))
      setTimeout(() => localStorage.removeItem(this.EVENT_KEY), 100)
    } catch (error) {
      console.error('发送事件失败:', error)
    }
  }

  /**
   * 本地触发事件
   */
  private emitLocal(type: string, data: any) {
    const typeListeners = this.listeners.get(type)
    if (typeListeners) {
      typeListeners.forEach(listener => listener(data))
    }
  }

  /**
   * 订阅事件
   */
  on(type: string, listener: Function): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)

    return () => {
      this.listeners.get(type)?.delete(listener)
    }
  }

  /**
   * 发布事件
   */
  emit(type: string, data: any) {
    this.send(type, data)
    this.emitLocal(type, data)
  }

  /**
   * 获取所有锁
   */
  getLocks(): Record<string, { userId: string; lockedAt: string }> {
    try {
      return JSON.parse(localStorage.getItem(this.LOCK_KEY) || '{}')
    } catch {
      return {}
    }
  }

  /**
   * 获取特定锁
   */
  getLock(slotId: string): { userId: string; lockedAt: string } | null {
    const locks = this.getLocks()
    const lock = locks[slotId]

    if (lock) {
      // 检查是否过期（30秒）
      const now = Date.now()
      const lockTime = new Date(lock.lockedAt).getTime()
      if (now - lockTime > 30000) {
        this.releaseLock(slotId)
        return null
      }
      return lock
    }
    return null
  }

  /**
   * 尝试获取锁
   */
  acquireLock(slotId: string, userId: string): boolean {
    console.log(`[GlobalEventBus] 尝试获取锁: ${slotId} by ${userId}`)
    const locks = this.getLocks()
    const existing = locks[slotId]

    // 检查是否已被其他用户锁定
    if (existing) {
      const now = Date.now()
      const lockTime = new Date(existing.lockedAt).getTime()
      // 如果锁未过期且不是当前用户，则获取失败
      if (now - lockTime <= 30000 && existing.userId !== userId) {
        console.log(`[GlobalEventBus] 获取锁失败: ${slotId} 已被 ${existing.userId} 锁定`)
        return false
      }
      // 如果是同一个用户尝试获取锁，则更新锁时间
      if (existing.userId === userId) {
        console.log(`[GlobalEventBus] 更新锁时间: ${slotId} by ${userId}`)
        locks[slotId] = {
          userId,
          lockedAt: new Date().toISOString()
        }
        localStorage.setItem(this.LOCK_KEY, JSON.stringify(locks))
        return true
      }
    }

    // 获取新锁
    console.log(`[GlobalEventBus] 获取新锁: ${slotId} by ${userId}`)
    locks[slotId] = {
      userId,
      lockedAt: new Date().toISOString()
    }
    localStorage.setItem(this.LOCK_KEY, JSON.stringify(locks))

    // 广播锁状态
    this.emit('lock_acquired', { slotId, userId })
    return true
  }

  /**
   * 释放锁
   */
  releaseLock(slotId: string, userId?: string) {
    console.log(`[GlobalEventBus] 释放锁: ${slotId} by ${userId || 'unknown'}`)
    const locks = this.getLocks()
    if (locks[slotId]) {
      if (!userId || locks[slotId].userId === userId) {
        const lockedBy = locks[slotId].userId
        delete locks[slotId]
        localStorage.setItem(this.LOCK_KEY, JSON.stringify(locks))
        console.log(`[GlobalEventBus] 成功释放锁: ${slotId} by ${lockedBy}`)
        this.emit('lock_released', { slotId, userId: lockedBy })
      } else {
        console.log(`[GlobalEventBus] 释放锁失败: ${slotId} 非持有者 ${userId}`)
      }
    } else {
      console.log(`[GlobalEventBus] 锁不存在: ${slotId}`)
    }
  }

  /**
   * 清理过期锁
   */
  cleanupLocks() {
    const locks = this.getLocks()
    const now = Date.now()
    let changed = false

    Object.entries(locks).forEach(([slotId, lock]) => {
      if (now - new Date(lock.lockedAt).getTime() > 30000) {
        delete locks[slotId]
        changed = true
      }
    })

    if (changed) {
      localStorage.setItem(this.LOCK_KEY, JSON.stringify(locks))
      this.emit('locks_cleaned', {})
    }
  }

  /**
   * 获取会话ID
   */
  getSessionId(): string {
    return this.sessionId
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
    this.listeners.clear()
  }
}
