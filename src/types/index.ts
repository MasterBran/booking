/**
 * 高并发实时预定系统 - 类型定义
 * Front-end System Design: High-Concurrency Real-time Booking UI
 */

// 时间段状态枚举
export const enum SlotStatus {
  AVAILABLE = 'available',      // 可用
  LOCKED = 'locked',            // 锁定中（正在处理预定）
  BOOKED = 'booked',            // 已预定
  EXPIRED = 'expired'           // 已过期
}

// 时间段锁定原因
export const enum LockReason {
  BOOKING_PENDING = 'booking_pending',  // 预定待确认
  MAINTENANCE = 'maintenance'           // 维护中
}

// 用户信息
export interface User {
  id: string
  name: string
  email: string
}

// 时间段数据模型
export interface TimeSlot {
  id: string
  startTime: string  // ISO 8601格式
  endTime: string    // ISO 8601格式
  status: SlotStatus
  lockedBy?: string  // 锁定者用户ID
  lockedAt?: string  // 锁定时间
  lockedReason?: LockReason
  bookedBy?: string  // 预定者用户ID
  bookedAt?: string  // 预定时间
  price?: number     // 价格（可选）
  resourceId?: string // 资源ID（会议室、工位等）
}

// 预定请求
export interface BookingRequest {
  slotId: string
  userId: string
  timestamp: string  // 客户端发起时间，用于防重放攻击
  clientId: string   // 客户端唯一标识
}

// 预定响应
export interface BookingResponse {
  success: boolean
  slot?: TimeSlot
  error?: {
    code: string
    message: string
    details?: any
  }
  conflict?: {
    slotId: string
    bookedBy: string
    bookedAt: string
  }
}

// API错误码
export enum ApiErrorCode {
  SLOT_NOT_FOUND = 'SLOT_NOT_FOUND',
  SLOT_ALREADY_BOOKED = 'SLOT_ALREADY_BOOKED',
  SLOT_LOCKED_BY_OTHER = 'SLOT_LOCKED_BY_OTHER',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',
  TIMESTAMP_EXPIRED = 'TIMESTAMP_EXPIRED',
  RATE_LIMITED = 'RATE_LIMITED'
}

// WebSocket消息类型
export enum WebSocketMessageType {
  SLOT_UPDATE = 'slot_update',           // 单个时间段更新
  BULK_SLOT_UPDATE = 'bulk_slot_update', // 批量时间段更新
  BOOKING_CONFIRMED = 'booking_confirmed', // 预定确认
  BOOKING_FAILED = 'booking_failed',     // 预定失败
  HEARTBEAT = 'heartbeat',               // 心跳
  ERROR = 'error'                        // 错误
}

// WebSocket消息基接口
export interface WebSocketMessage {
  type: WebSocketMessageType
  timestamp: string
  data: any
}

// 单个时间段更新
export interface SlotUpdateMessage extends WebSocketMessage {
  type: WebSocketMessageType.SLOT_UPDATE
  data: {
    slot: TimeSlot
  }
}

// 批量时间段更新
export interface BulkSlotUpdateMessage extends WebSocketMessage {
  type: WebSocketMessageType.BULK_SLOT_UPDATE
  data: {
    slots: TimeSlot[]
  }
}

// 预定确认消息
export interface BookingConfirmedMessage extends WebSocketMessage {
  type: WebSocketMessageType.BOOKING_CONFIRMED
  data: {
    slotId: string
    userId: string
    bookingId: string
  }
}

// 预定失败消息
export interface BookingFailedMessage extends WebSocketMessage {
  type: WebSocketMessageType.BOOKING_FAILED
  data: {
    slotId: string
    userId: string
    error: {
      code: ApiErrorCode
      message: string
    }
  }
}

// HTTP API 接口定义
export interface BookingAPI {
  // 获取可用时间段列表
  getAvailableSlots(resourceId?: string): Promise<TimeSlot[]>

  // 预定时间段
  bookSlot(request: BookingRequest): Promise<BookingResponse>

  // 取消预定
  cancelBooking(slotId: string, userId: string): Promise<{ success: boolean; error?: string }>

  // 锁定时间段（用于防止并发冲突）
  lockSlot(slotId: string, userId: string): Promise<{ success: boolean; error?: string }>

  // 解锁时间段
  unlockSlot(slotId: string, userId: string): Promise<{ success: boolean; error?: string }>
}

// 客户端状态追踪
export interface ClientBookingState {
  clientId: string
  userId: string
  pendingBookings: Map<string, {
    slotId: string
    timestamp: string
    status: 'pending' | 'confirmed' | 'failed'
  }>
  optimisticUpdates: Map<string, TimeSlot> // 乐观更新缓存
}

// 并发控制配置
export interface ConcurrencyConfig {
  maxPendingTime: number      // 最大等待时间（毫秒）
  retryAttempts: number       // 重试次数
  retryDelay: number          // 重试延迟（毫秒）
  lockTimeout: number         // 锁定超时（毫秒）
  enableOptimisticUpdate: boolean // 是否启用乐观更新
}
