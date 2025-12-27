import React, { useState } from 'react'
import {
  Box,
  Button,
  Paper,
  Typography,
  TextField,
  Grid,
  Alert,
  Divider
} from '@mui/material'
import { MockBookingAPI } from '../services/BookingAPI'
import { ConcurrencyTester } from '../utils/ConcurrencyTester'

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
      const report = await tester.runAllTests()
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

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
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
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, maxHeight: '600px', overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              测试结果
            </Typography>

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
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          📚 测试说明
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              并发预定测试
            </Typography>
            <Typography variant="body2" color="text.secondary">
              模拟多个用户同时点击同一个时间段，验证系统能否正确处理并发冲突。
              预期结果：只有一个用户成功，其他用户收到冲突提示。
            </Typography>
          </Grid>

          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              快速预定测试
            </Typography>
            <Typography variant="body2" color="text.secondary">
              模拟用户在短时间内快速点击预定按钮，验证系统的防重复提交能力。
              预期结果：只有第一次请求生效，后续请求被阻止。
            </Typography>
          </Grid>

          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              锁定超时测试
            </Typography>
            <Typography variant="body2" color="text.secondary">
              验证锁定机制的超时自动解除功能。
              预期结果：30秒后自动解锁，时间段恢复为可用状态。
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  )
}
