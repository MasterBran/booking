import React, { useState } from 'react'
import {
  Box,
  Button,
  Paper,
  Typography,
  TextField,
  Alert,
  Divider,
  Chip
} from '@mui/material'
import { MockBookingAPI } from '../services/BookingAPI'
import { ConcurrencyTester } from '../utils/ConcurrencyTester'
import { GlobalEventBus } from '../services/GlobalEventBus'

/**
 * 并发测试演示组件
 * 用于演示高并发场景下的预定系统行为
 */
export const ConcurrencyDemo: React.FC = () => {
  const [api] = useState(() => new MockBookingAPI())
  const [tester] = useState(() => new ConcurrencyTester(api))
  const [slotId, setSlotId] = useState('slot-1')
  const [userCount, setUserCount] = useState(5)
  const [clickCount, setClickCount] = useState(10)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [globalEventBus] = useState(() => GlobalEventBus.getInstance())
  const [globalLocks, setGlobalLocks] = useState<Record<string, any>>({})

  const runConcurrentBooking = async () => {
    setLoading(true)
    try {
      const result = await tester.simulateConcurrentBooking(slotId, userCount)
      setResults(prev => [...prev, { type: '并发预定测试', ...result }])
    } catch (error) {
      console.error('测试失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const runRapidBooking = async () => {
    setLoading(true)
    try {
      const result = await tester.simulateRapidBooking(slotId, 'rapid-user', clickCount)
      setResults(prev => [...prev, { type: '快速预定测试', ...result }])
    } catch (error) {
      console.error('测试失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const runLockTimeout = async () => {
    setLoading(true)
    try {
      await tester.testLockTimeout(slotId)
      setResults(prev => [...prev, { type: '锁定超时测试', message: '完成' }])
    } catch (error) {
      console.error('测试失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const runAllTests = async () => {
    setLoading(true)
    try {
      // 使用AutomatedConcurrencyTests运行完整测试套件
      const { AutomatedConcurrencyTests } = await import('../utils/ConcurrencyTester')
      const autoTester = new AutomatedConcurrencyTests(api)
      const report = await autoTester.runAllTests()
      setResults(prev => [...prev, { type: '完整测试套件', report }])
    } catch (error) {
      console.error('测试失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetAPI = () => {
    api.reset()
    setResults([])
  }

  // 【新增】跨页签并发测试
  const runCrossTabTest = async () => {
    setLoading(true)
    try {
      // 模拟两个页签同时预定
      const tab1Result = await api.bookSlot({
        slotId,
        userId: 'tab1-user',
        timestamp: new Date().toISOString(),
        clientId: 'tab1'
      })

      const tab2Result = await api.bookSlot({
        slotId,
        userId: 'tab2-user',
        timestamp: new Date().toISOString(),
        clientId: 'tab2'
      })

      setResults(prev => [...prev, {
        type: '跨页签并发测试',
        tab1: tab1Result,
        tab2: tab2Result,
        message: tab1Result.success !== tab2Result.success ? '成功检测到并发冲突' : '可能存在竞态条件'
      }])
    } catch (error) {
      console.error('跨页签测试失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 【新增】全局锁测试
  const testGlobalLock = () => {
    const testUserId = 'test-user-' + Math.floor(Math.random() * 1000)

    // 尝试获取锁
    const acquired = globalEventBus.acquireLock(slotId, testUserId)

    // 获取当前所有锁
    const locks = globalEventBus.getLocks()
    setGlobalLocks(locks)

    setResults(prev => [...prev, {
      type: '全局锁测试',
      action: `用户 ${testUserId} 尝试锁定 ${slotId}`,
      result: acquired ? '成功获取锁' : '获取锁失败（已被占用）',
      currentLocks: locks
    }])
  }

  // 【新增】清理全局锁
  const cleanupGlobalLocks = () => {
    globalEventBus.cleanupLocks()
    const locks = globalEventBus.getLocks()
    setGlobalLocks(locks)

    setResults(prev => [...prev, {
      type: '清理全局锁',
      message: '已清理过期锁',
      remainingLocks: locks
    }])
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        🧪 高并发预定系统测试演示
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          该演示展示了系统在高并发场景下的行为。可以模拟多个用户同时预定、
          快速点击攻击和锁定超时等情况。
        </Typography>
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              测试配置
            </Typography>

            <TextField
              label="时间段ID"
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
              fullWidth
              margin="normal"
            />

            <TextField
              label="用户数量"
              type="number"
              value={userCount}
              onChange={(e) => setUserCount(parseInt(e.target.value))}
              fullWidth
              margin="normal"
              inputProps={{ min: 2, max: 20 }}
            />

            <TextField
              label="点击次数"
              type="number"
              value={clickCount}
              onChange={(e) => setClickCount(parseInt(e.target.value))}
              fullWidth
              margin="normal"
              inputProps={{ min: 1, max: 50 }}
            />

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="contained"
                onClick={runConcurrentBooking}
                disabled={loading}
              >
                并发预定测试 (5-20用户同时预定)
              </Button>

              <Button
                variant="contained"
                onClick={runRapidBooking}
                disabled={loading}
              >
                快速预定测试 (单用户快速点击)
              </Button>

              <Button
                variant="contained"
                onClick={runLockTimeout}
                disabled={loading}
              >
                锁定超时测试 (30秒自动解锁)
              </Button>

              <Button
                variant="contained"
                color="secondary"
                onClick={runAllTests}
                disabled={loading}
              >
                运行完整测试套件
              </Button>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" gutterBottom>
                跨页签并发测试
              </Typography>

              <Button
                variant="outlined"
                onClick={runCrossTabTest}
                disabled={loading}
                fullWidth
              >
                跨页签并发预定测试
              </Button>

              <Button
                variant="outlined"
                onClick={testGlobalLock}
                disabled={loading}
                fullWidth
              >
                测试全局锁机制
              </Button>

              <Button
                variant="outlined"
                onClick={cleanupGlobalLocks}
                disabled={loading}
                fullWidth
              >
                清理过期全局锁
              </Button>

              <Divider sx={{ my: 2 }} />

              <Button
                variant="outlined"
                color="error"
                onClick={resetAPI}
                disabled={loading}
              >
                重置API状态
              </Button>
            </Box>
          </Paper>

          <Paper sx={{ p: 3, maxHeight: '600px', overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              测试结果
            </Typography>

            {/* 【新增】全局锁状态显示 */}
            <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f5f5f5' }}>
              <Typography variant="subtitle2" gutterBottom>
                🔒 当前全局锁状态
              </Typography>
              {Object.keys(globalLocks).length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  无活跃锁
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(globalLocks).map(([slotId, lock]) => (
                    <Box key={slotId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight="bold">
                        {slotId}:
                      </Typography>
                      <Chip
                        label={`${lock.userId}`}
                        size="small"
                        color="primary"
                      />
                      <Typography variant="caption" color="text.secondary">
                        {new Date(lock.lockedAt).toLocaleTimeString()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>

            {results.length === 0 ? (
              <Typography color="text.secondary">
                暂无测试结果，请运行测试
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {results.map((result, index) => (
                  <Paper
                    key={index}
                    sx={{
                      p: 2,
                      backgroundColor: result.type.includes('并发') ? '#e3f2fd' :
                                     result.type.includes('快速') ? '#fff3e0' :
                                     result.type.includes('超时') ? '#f3e5f5' :
                                     result.type.includes('跨页签') ? '#e1f5fe' :
                                     result.type.includes('全局锁') ? '#f3e5f5' :
                                     '#e8f5e9'
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight="bold">
                      {result.type}
                    </Typography>

                    {result.success !== undefined && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          成功: {result.success} | 失败: {result.failed} | 冲突: {result.conflicts}
                        </Typography>
                      </Box>
                    )}

                    {result.blocked !== undefined && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          总尝试: {result.totalAttempts} | 成功: {result.successful} | 被阻止: {result.blocked}
                        </Typography>
                      </Box>
                    )}

                    {result.tab1 && result.tab2 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          页签1: {result.tab1.success ? '✅成功' : '❌失败'}
                        </Typography>
                        <Typography variant="body2">
                          页签2: {result.tab2.success ? '✅成功' : '❌失败'}
                        </Typography>
                        <Typography variant="body2" color="primary" sx={{ mt: 1, fontWeight: 'bold' }}>
                          {result.message}
                        </Typography>
                      </Box>
                    )}

                    {result.action && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {result.action}
                      </Typography>
                    )}

                    {result.result && (
                      <Typography variant="body2" sx={{ mt: 1 }} color="primary">
                        {result.result}
                      </Typography>
                    )}

                    {result.message && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {result.message}
                      </Typography>
                    )}

                    {result.report && (
                      <Typography
                        variant="body2"
                        component="pre"
                        sx={{
                          mt: 1,
                          p: 1,
                          backgroundColor: 'rgba(0,0,0,0.1)',
                          borderRadius: 1,
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {result.report}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            )}
          </Paper>
        </Box>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          📚 测试说明
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              并发预定测试
            </Typography>
            <Typography variant="body2" color="text.secondary">
              模拟多个用户同时点击同一个时间段，验证系统能否正确处理并发冲突。
              预期结果：只有一个用户成功，其他用户收到冲突提示。
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              快速预定测试
            </Typography>
            <Typography variant="body2" color="text.secondary">
              模拟用户在短时间内快速点击预定按钮，验证系统的防重复提交能力。
              预期结果：只有第一次请求生效，后续请求被阻止。
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              锁定超时测试
            </Typography>
            <Typography variant="body2" color="text.secondary">
              验证锁定机制的超时自动解除功能。
              预期结果：30秒后自动解锁，时间段恢复为可用状态。
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              跨页签并发测试
            </Typography>
            <Typography variant="body2" color="text.secondary">
              【新增功能】模拟多个浏览器标签页同时预定，验证全局锁机制。
              预期结果：只有一个页签成功获取锁，其他页签收到锁定提示。
              通过 BroadcastChannel + localStorage 实现跨页签数据同步。
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              全局锁机制
            </Typography>
            <Typography variant="body2" color="text.secondary">
              【新增功能】使用全局事件总线管理跨页签锁状态，防止并发冲突。
              支持30秒锁超时自动清理，确保系统的健壮性。
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              WebSocket降级方案
            </Typography>
            <Typography variant="body2" color="text.secondary">
              当WebSocket服务不可用时，自动切换到全局事件总线方案，
              保证跨页签并发冲突处理逻辑仍然有效。
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
