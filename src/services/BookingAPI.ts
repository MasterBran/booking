import { v4 as uuidv4 } from 'uuid'
import {
  TimeSlot,
  BookingRequest,
  BookingResponse,
  ApiErrorCode,
  SlotStatus,
  LockReason
} from '../types'

export interface BookingAPI {
  getAvailableSlots(resourceId?: string): Promise<TimeSlot[]>
  bookSlot(request: BookingRequest): Promise<BookingResponse>
  cancelBooking(slotId: string, userId: string): Promise<{ success: boolean; error?: string }>
  lockSlot(slotId: string, userId: string): Promise<{ success: boolean; error?: string }>
  unlockSlot(slotId: string, userId: string): Promise<{ success: boolean; error?: string }>
}

export class MockBookingAPI implements BookingAPI {
  private slots: Map<string, TimeSlot> = new Map()
  private bookingLocks: Map<string, { userId: string; lockedAt: string }> = new Map()
  private bookingConfirmations: Map<string, { userId: string; confirmedAt: string }> = new Map()

  constructor() {
    this.initializeMockData()
  }

  private initializeMockData() {
    const now = new Date()
    const baseTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0)

    for (let i = 0; i < 24; i++) {
      const start = new Date(baseTime.getTime() + i * 30 * 60 * 1000)
      const end = new Date(start.getTime() + 30 * 60 * 1000)

      this.slots.set(`slot-${i + 1}`, {
        id: `slot-${i + 1}`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: SlotStatus.AVAILABLE,
        price: 50 + i * 5,
        resourceId: 'room-001'
      })
    }
  }

  async getAvailableSlots(resourceId?: string): Promise<TimeSlot[]> {
    await this.simulateDelay(300)

    let slots = Array.from(this.slots.values())

    if (resourceId) {
      slots = slots.filter(slot => slot.resourceId === resourceId)
    }

    this.cleanupExpiredLocks()

    return slots
  }

  async bookSlot(request: BookingRequest): Promise<BookingResponse> {
    await this.simulateDelay(500 + Math.random() * 1000)

    const slot = this.slots.get(request.slotId)

    if (!slot) {
      return {
        success: false,
        error: {
          code: ApiErrorCode.SLOT_NOT_FOUND,
          message: '时间段不存在'
        }
      }
    }

    if (slot.status === SlotStatus.BOOKED) {
      return {
        success: false,
        error: {
          code: ApiErrorCode.SLOT_ALREADY_BOOKED,
          message: '该时间段已被预定'
        },
        conflict: {
          slotId: slot.id,
          bookedBy: slot.bookedBy!,
          bookedAt: slot.bookedAt!
        }
      }
    }

    if (slot.status === SlotStatus.LOCKED && slot.lockedBy !== request.userId) {
      return {
        success: false,
        error: {
          code: ApiErrorCode.SLOT_LOCKED_BY_OTHER,
          message: '该时间段正在被其他用户预定'
        }
      }
    }

    if (Math.random() < 0.1) {
      const otherUserId = `user-${Math.floor(Math.random() * 1000)}`
      const confirmedSlot = {
        ...slot,
        status: SlotStatus.BOOKED,
        bookedBy: otherUserId,
        bookedAt: new Date().toISOString(),
        lockedBy: undefined,
        lockedAt: undefined
      }

      this.slots.set(request.slotId, confirmedSlot)

      return {
        success: false,
        error: {
          code: ApiErrorCode.CONFLICT_DETECTED,
          message: '并发冲突：该时间段已被其他用户预定'
        },
        conflict: {
          slotId: slot.id,
          bookedBy: otherUserId,
          bookedAt: confirmedSlot.bookedAt!
        }
      }
    }

    const bookedSlot = {
      ...slot,
      status: SlotStatus.BOOKED,
      bookedBy: request.userId,
      bookedAt: new Date().toISOString(),
      lockedBy: undefined,
      lockedAt: undefined
    }

    this.slots.set(request.slotId, bookedSlot)
    this.bookingConfirmations.set(request.slotId, {
      userId: request.userId,
      confirmedAt: bookedSlot.bookedAt!
    })

    return {
      success: true,
      slot: bookedSlot
    }
  }

  async cancelBooking(slotId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    await this.simulateDelay(300)

    const slot = this.slots.get(slotId)

    if (!slot) {
      return { success: false, error: '时间段不存在' }
    }

    if (slot.bookedBy !== userId) {
      return { success: false, error: '只能取消自己的预定' }
    }

    if (slot.status !== SlotStatus.BOOKED) {
      return { success: false, error: '该时间段未处于预定状态' }
    }

    const cancelledSlot = {
      ...slot,
      status: SlotStatus.AVAILABLE,
      bookedBy: undefined,
      bookedAt: undefined
    }

    this.slots.set(slotId, cancelledSlot)
    this.bookingConfirmations.delete(slotId)

    return { success: true }
  }

  async lockSlot(slotId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    await this.simulateDelay(100)

    const slot = this.slots.get(slotId)

    if (!slot) {
      return { success: false, error: '时间段不存在' }
    }

    if (slot.status !== SlotStatus.AVAILABLE) {
      return { success: false, error: '时间段不可锁定' }
    }

    const existingLock = this.bookingLocks.get(slotId)
    if (existingLock && existingLock.userId !== userId) {
      return { success: false, error: '该时间段已被其他用户锁定' }
    }

    this.bookingLocks.set(slotId, {
      userId,
      lockedAt: new Date().toISOString()
    })

    const lockedSlot = {
      ...slot,
      status: SlotStatus.LOCKED,
      lockedBy: userId,
      lockedAt: new Date().toISOString(),
      lockedReason: LockReason.BOOKING_PENDING
    }

    this.slots.set(slotId, lockedSlot)

    setTimeout(() => {
      this.unlockSlot(slotId, userId)
    }, 30000)

    return { success: true }
  }

  async unlockSlot(slotId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    await this.simulateDelay(100)

    const slot = this.slots.get(slotId)
    const lock = this.bookingLocks.get(slotId)

    if (!slot || !lock) {
      return { success: false, error: '时间段或锁定记录不存在' }
    }

    if (lock.userId !== userId) {
      return { success: false, error: '只能解锁自己锁定的时间段' }
    }

    if (slot.status === SlotStatus.LOCKED && !slot.bookedBy) {
      const unlockedSlot = {
        ...slot,
        status: SlotStatus.AVAILABLE,
        lockedBy: undefined,
        lockedAt: undefined,
        lockedReason: undefined
      }

      this.slots.set(slotId, unlockedSlot)
    }

    this.bookingLocks.delete(slotId)

    return { success: true }
  }

  private cleanupExpiredLocks() {
    const now = new Date().getTime()
    const timeout = 30000

    this.bookingLocks.forEach((lock, slotId) => {
      const lockedAt = new Date(lock.lockedAt).getTime()
      if (now - lockedAt > timeout) {
        const slot = this.slots.get(slotId)
        if (slot && slot.status === SlotStatus.LOCKED && !slot.bookedBy) {
          const unlockedSlot = {
            ...slot,
            status: SlotStatus.AVAILABLE,
            lockedBy: undefined,
            lockedAt: undefined,
            lockedReason: undefined
          }
          this.slots.set(slotId, unlockedSlot)
        }
        this.bookingLocks.delete(slotId)
      }
    })
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getDebugState() {
    return {
      slots: Array.from(this.slots.values()),
      locks: Array.from(this.bookingLocks.entries()),
      confirmations: Array.from(this.bookingConfirmations.entries())
    }
  }

  simulateConcurrentBooking(slotId: string, userId: string): Promise<BookingResponse> {
    const request: BookingRequest = {
      slotId,
      userId,
      timestamp: new Date().toISOString(),
      clientId: uuidv4()
    }

    return this.bookSlot(request)
  }

  reset() {
    this.slots.clear()
    this.bookingLocks.clear()
    this.bookingConfirmations.clear()
    this.initializeMockData()
  }
}
