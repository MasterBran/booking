import { MockBookingAPI } from '../services/BookingAPI'
import {  BookingRequest  } from '../types'
import { v4 as uuidv4 } from 'uuid'

/**
 * 并发测试工具
 * 用于测试高并发场景下的预定系统
 */
export class ConcurrencyTester {
  private api: MockBookingAPI

  constructor(api: MockBookingAPI) {
    this.api = api
  }

  /**
   * 模拟多个用户同时预定同一个时间段
   */
  async simulateConcurrentBooking(
    slotId: string,
    userCount: number = 5
  ): Promise<{
    success: number
    failed: number
    conflicts: number
    results: Array<{
      userId: string
      success: boolean
      error?: string
      conflict?: any
    }>
  }> {
    console.log(`\n🚀 开始并发测试: ${userCount} 个用户同时预定时间段 ${slotId}`)

    const promises: Promise<any>[] = []

    for (let i = 0; i < userCount; i++) {
      const userId = `test-user-${i + 1}`
      const request: BookingRequest = {
        slotId,
        userId,
        timestamp: new Date().toISOString(),
        clientId: uuidv4()
      }

      promises.push(
        this.api.bookSlot(request).then(result => ({
          userId,
          success: result.success,
          error: result.error?.message,
          conflict: result.conflict
        }))
      )
    }

    const results = await Promise.all(promises)

    const success = results.filter(r => r.success).length
    const failed = results.length - success
    const conflicts = results.filter(r => r.conflict).length

    console.log(`\n✅ 并发测试结果:`)
    console.log(`   - 成功: ${success}`)
    console.log(`   - 失败: ${failed}`)
    console.log(`   - 冲突: ${conflicts}`)

    // 显示详细结果
    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌'
      const conflictInfo = result.conflict ? ` [冲突: ${result.conflict.bookedBy}]` : ''
      console.log(`   ${status} 用户${index + 1} (${result.userId}): ${result.error || '预定成功'}${conflictInfo}`)
    })

    return {
      success,
      failed,
      conflicts,
      results
    }
  }

  /**
   * 模拟连续预定攻击（快速点击）
   */
  async simulateRapidBooking(
    slotId: string,
    userId: string = 'rapid-user',
    clickCount: number = 10
  ): Promise<{
    totalAttempts: number
    successful: number
    blocked: number
  }> {
    console.log(`\n🔥 开始快速预定测试: 用户 ${userId} 连续点击 ${clickCount} 次`)

    let successful = 0
    let blocked = 0

    for (let i = 0; i < clickCount; i++) {
      const request: BookingRequest = {
        slotId,
        userId,
        timestamp: new Date().toISOString(),
        clientId: uuidv4()
      }

      const result = await this.api.bookSlot(request)

      if (result.success) {
        successful++
      } else {
        blocked++
      }

      // 短暂延迟模拟用户快速点击
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`\n📊 快速预定测试结果:`)
    console.log(`   - 总尝试: ${clickCount}`)
    console.log(`   - 成功: ${successful}`)
    console.log(`   - 被阻止: ${blocked}`)

    return {
      totalAttempts: clickCount,
      successful,
      blocked
    }
  }

  /**
   * 模拟锁定超时测试
   */
  async testLockTimeout(
    slotId: string,
    userId: string = 'lock-user'
  ): Promise<void> {
    console.log(`\n⏱️  开始锁定超时测试`)

    // 锁定时间段
    const lockResult = await this.api.lockSlot(slotId, userId)
    console.log(`   锁定结果: ${lockResult.success ? '成功' : '失败'}`)

    if (!lockResult.success) {
      return
    }

    console.log(`   等待 35 秒后检查自动解锁...`)

    // 等待超过锁定超时时间（30秒）
    await new Promise(resolve => setTimeout(resolve, 35000))

    // 检查状态
    const slots = await this.api.getAvailableSlots()
    const slot = slots.find(s => s.id === slotId)

    if (slot) {
      console.log(`   ✅ 锁定已自动解除，当前状态: ${slot.status}`)
    } else {
      console.log(`   ❌ 无法获取时间段状态`)
    }
  }

  /**
   * 生成测试报告
   */
  generateTestReport(results: any[]): string {
    let report = '\n📋 并发测试报告\n'
    report += '='.repeat(50) + '\n\n'

    results.forEach((result, index) => {
      report += `测试 ${index + 1}:\n`
      report += `  - 类型: ${result.type}\n`
      report += `  - 详情: ${JSON.stringify(result, null, 2)}\n\n`
    })

    report += '='.repeat(50)
    return report
  }
}

/**
 * 自动化并发测试套件
 */
export class AutomatedConcurrencyTests {
  private tester: ConcurrencyTester

  constructor(api: MockBookingAPI) {
    this.tester = new ConcurrencyTester(api)
  }

  /**
   * 运行所有测试
   */
  async runAllTests(): Promise<string> {
    console.log('\n🎯 开始运行完整的并发测试套件\n')

    const results: any[] = []

    // 测试1: 基本并发冲突
    const result1 = await this.tester.simulateConcurrentBooking('slot-1', 5)
    results.push({ type: '基本并发冲突', ...result1 })

    // 等待一秒
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 测试2: 高并发（10个用户）
    const result2 = await this.tester.simulateConcurrentBooking('slot-2', 10)
    results.push({ type: '高并发测试', ...result2 })

    // 等待一秒
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 测试3: 快速预定
    const result3 = await this.tester.simulateRapidBooking('slot-3', 'rapid-user', 10)
    results.push({ type: '快速预定测试', ...result3 })

    return this.tester.generateTestReport(results)
  }
}
