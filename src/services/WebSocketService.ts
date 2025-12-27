import {
  WebSocketMessage,
  WebSocketMessageType,
  TimeSlot,
  SlotUpdateMessage,
  BulkSlotUpdateMessage,
  BookingConfirmedMessage,
  BookingFailedMessage
} from '../types'

/**
 * WebSocket实时同步服务
 * 处理与后端的实时通信，支持多用户状态同步
 */
export class WebSocketService {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 3000 // 3秒
  private heartbeatInterval: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isIntentionallyClosed: boolean = false

  // 事件监听器
  private slotUpdateListeners: Array<(slot: TimeSlot) => void> = []
  private bulkSlotUpdateListeners: Array<(slots: TimeSlot[]) => void> = []
  private bookingConfirmedListeners: Array<(data: any) => void> = []
  private bookingFailedListeners: Array<(data: any) => void> = []
  private connectionChangeListeners: Array<(connected: boolean) => void> = []
  private errorListeners: Array<(error: any) => void> = []

  constructor(url: string = 'ws://localhost:8080/ws') {
    this.url = url
  }

  /**
   * 连接到WebSocket服务器
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.isIntentionallyClosed = false
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WebSocket连接已建立')
          this.reconnectAttempts = 0
          this.startHeartbeat()
          this.notifyConnectionChange(true)
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket错误:', error)
          this.notifyError(error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('WebSocket连接已关闭')
          this.stopHeartbeat()
          this.notifyConnectionChange(false)

          if (!this.isIntentionallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.isIntentionallyClosed = true
    this.stopHeartbeat()
    this.clearReconnectTimer()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * 发送消息
   */
  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket未连接，无法发送消息')
    }
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: string) {
    try {
      const message: WebSocketMessage = JSON.parse(data)

      switch (message.type) {
        case WebSocketMessageType.SLOT_UPDATE:
          this.handleSlotUpdate(message as SlotUpdateMessage)
          break

        case WebSocketMessageType.BULK_SLOT_UPDATE:
          this.handleBulkSlotUpdate(message as BulkSlotUpdateMessage)
          break

        case WebSocketMessageType.BOOKING_CONFIRMED:
          this.handleBookingConfirmed(message as BookingConfirmedMessage)
          break

        case WebSocketMessageType.BOOKING_FAILED:
          this.handleBookingFailed(message as BookingFailedMessage)
          break

        case WebSocketMessageType.HEARTBEAT:
          // 响应心跳
          this.send({ type: WebSocketMessageType.HEARTBEAT, timestamp: new Date().toISOString() })
          break

        case WebSocketMessageType.ERROR:
          console.error('WebSocket服务端错误:', message.data)
          this.notifyError(message.data)
          break

        default:
          console.warn('未知的消息类型:', message.type)
      }
    } catch (error) {
      console.error('解析WebSocket消息失败:', error)
    }
  }

  /**
   * 处理单个时间段更新
   */
  private handleSlotUpdate(message: SlotUpdateMessage) {
    this.slotUpdateListeners.forEach(listener => {
      listener(message.data.slot)
    })
  }

  /**
   * 处理批量时间段更新
   */
  private handleBulkSlotUpdate(message: BulkSlotUpdateMessage) {
    this.bulkSlotUpdateListeners.forEach(listener => {
      listener(message.data.slots)
    })
  }

  /**
   * 处理预定确认
   */
  private handleBookingConfirmed(message: BookingConfirmedMessage) {
    this.bookingConfirmedListeners.forEach(listener => {
      listener(message.data)
    })
  }

  /**
   * 处理预定失败
   */
  private handleBookingFailed(message: BookingFailedMessage) {
    this.bookingFailedListeners.forEach(listener => {
      listener(message.data)
    })
  }

  /**
   * 开始心跳
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: WebSocketMessageType.HEARTBEAT,
        timestamp: new Date().toISOString()
      })
    }, 30000) // 每30秒发送一次心跳
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * 计划重连
   */
  private scheduleReconnect() {
    this.reconnectAttempts++
    console.log(`计划在 ${this.reconnectDelay}ms 后进行第 ${this.reconnectAttempts} 次重连...`)

    this.reconnectTimer = setTimeout(() => {
      console.log(`尝试第 ${this.reconnectAttempts} 次重连...`)
      this.connect().catch(() => {
        // 重连失败会在onerror中处理
      })
    }, this.reconnectDelay)
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /**
   * 通知连接状态变化
   */
  private notifyConnectionChange(connected: boolean) {
    this.connectionChangeListeners.forEach(listener => {
      listener(connected)
    })
  }

  /**
   * 通知错误
   */
  private notifyError(error: any) {
    this.errorListeners.forEach(listener => {
      listener(error)
    })
  }

  // === 事件监听器注册方法 ===

  onSlotUpdate(listener: (slot: TimeSlot) => void) {
    this.slotUpdateListeners.push(listener)
    return () => {
      const index = this.slotUpdateListeners.indexOf(listener)
      if (index > -1) {
        this.slotUpdateListeners.splice(index, 1)
      }
    }
  }

  onBulkSlotUpdate(listener: (slots: TimeSlot[]) => void) {
    this.bulkSlotUpdateListeners.push(listener)
    return () => {
      const index = this.bulkSlotUpdateListeners.indexOf(listener)
      if (index > -1) {
        this.bulkSlotUpdateListeners.splice(index, 1)
      }
    }
  }

  onBookingConfirmed(listener: (data: any) => void) {
    this.bookingConfirmedListeners.push(listener)
    return () => {
      const index = this.bookingConfirmedListeners.indexOf(listener)
      if (index > -1) {
        this.bookingConfirmedListeners.splice(index, 1)
      }
    }
  }

  onBookingFailed(listener: (data: any) => void) {
    this.bookingFailedListeners.push(listener)
    return () => {
      const index = this.bookingFailedListeners.indexOf(listener)
      if (index > -1) {
        this.bookingFailedListeners.splice(index, 1)
      }
    }
  }

  onConnectionChange(listener: (connected: boolean) => void) {
    this.connectionChangeListeners.push(listener)
    return () => {
      const index = this.connectionChangeListeners.indexOf(listener)
      if (index > -1) {
        this.connectionChangeListeners.splice(index, 1)
      }
    }
  }

  onError(listener: (error: any) => void) {
    this.errorListeners.push(listener)
    return () => {
      const index = this.errorListeners.indexOf(listener)
      if (index > -1) {
        this.errorListeners.splice(index, 1)
      }
    }
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * 订阅时间段更新
   */
  subscribeToSlotUpdates(slotIds?: string[]) {
    this.send({
      type: 'subscribe',
      data: {
        slotIds: slotIds || [],
        timestamp: new Date().toISOString()
      }
    })
  }

  /**
   * 取消订阅
   */
  unsubscribeFromSlotUpdates() {
    this.send({
      type: 'unsubscribe',
      timestamp: new Date().toISOString()
    })
  }
}
