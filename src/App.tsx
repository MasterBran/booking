import React, { useEffect, useState } from 'react'
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  AppBar,
  Toolbar,
  Alert,
  Paper,
  Link
} from '@mui/material'
import { BrowserRouter, Routes, Route, Link as RouterLink } from 'react-router-dom'
import { BookingStore } from './stores/BookingStore'
import { TimeSlotGrid } from './components/TimeSlotGrid'
import { ConcurrencyDemo } from './demo/ConcurrencyDemo'
import { MockBookingAPI } from './services/BookingAPI'
import { WebSocketService } from './services/WebSocketService'

// 创建Material-UI主题
const theme = createTheme({
  palette: {
    primary: {
      main: '#2196f3'
    },
    secondary: {
      main: '#f50057'
    }
  },
  typography: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif'
  }
})

function App() {
  const [bookingStore, setBookingStore] = useState<BookingStore | null>(null)
  const [userDialogOpen, setUserDialogOpen] = useState(true)
  const [userName, setUserName] = useState('')
  const [userId, setUserId] = useState('')
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    // 初始化服务
    const initApp = async () => {
      try {
        // 创建API服务（模拟）
        const apiService = new MockBookingAPI()

        // 创建WebSocket服务
        const wsService = new WebSocketService('ws://localhost:8080/ws')

        // 创建BookingStore
        const store = new BookingStore(apiService, wsService)
        setBookingStore(store)

        // 连接到WebSocket
        try {
          await wsService.connect()
          console.log('WebSocket连接成功')
        } catch (wsError) {
          console.warn('WebSocket连接失败，将使用轮询模式:', wsError)
        }

      } catch (error) {
        setInitError(error instanceof Error ? error.message : '应用初始化失败')
      }
    }

    initApp()
  }, [])

  const handleSetUser = () => {
    if (!userName.trim()) {
      alert('请输入用户名')
      return
    }

    const id = userId || `user-${Date.now()}`
    bookingStore?.setCurrentUser({
      id,
      name: userName
    })

    setUserDialogOpen(false)

    // 加载初始数据
    bookingStore?.loadSlots()
  }

  const handleRefresh = () => {
    bookingStore?.loadSlots()
  }

  if (initError) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Container maxWidth="md" sx={{ py: 8 }}>
          <Alert severity="error">
            <Typography variant="h6">应用初始化失败</Typography>
            <Typography>{initError}</Typography>
            <Button
              variant="contained"
              sx={{ mt: 2 }}
              onClick={() => window.location.reload()}
            >
              重新加载
            </Button>
          </Alert>
        </Container>
      </ThemeProvider>
    )
  }

  if (!bookingStore) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Container maxWidth="md" sx={{ py: 8 }}>
          <Typography>加载中...</Typography>
        </Container>
      </ThemeProvider>
    )
  }

  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppBar position="sticky">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flex: 1 }}>
              高并发实时预定系统
            </Typography>
            <Button color="inherit" component={RouterLink} to="/">
              主页
            </Button>
            <Button color="inherit" component={RouterLink} to="/demo">
              测试演示
            </Button>
            <Button color="inherit" onClick={handleRefresh}>
              刷新
            </Button>
          </Toolbar>
        </AppBar>

        <Routes>
          <Route path="/" element={
            <Container maxWidth="lg" sx={{ py: 4 }}>
              {/* 系统特性说明 */}
              <Paper sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                <Typography variant="h5" gutterBottom>
                  🚀 高并发实时预定系统
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  支持并发冲突处理 · 乐观更新 · 实时状态同步 · 优雅回滚
                </Typography>
                <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Paper sx={{ px: 2, py: 0.5, background: 'rgba(255,255,255,0.2)' }}>
                    <Typography variant="caption">✓ 防止并发冲突</Typography>
                  </Paper>
                  <Paper sx={{ px: 2, py: 0.5, background: 'rgba(255,255,255,0.2)' }}>
                    <Typography variant="caption">✓ 实时状态同步</Typography>
                  </Paper>
                  <Paper sx={{ px: 2, py: 0.5, background: 'rgba(255,255,255,0.2)' }}>
                    <Typography variant="caption">✓ 乐观UI更新</Typography>
                  </Paper>
                  <Paper sx={{ px: 2, py: 0.5, background: 'rgba(255,255,255,0.2)' }}>
                    <Typography variant="caption">✓ 智能回滚机制</Typography>
                  </Paper>
                  <Paper sx={{ px: 2, py: 0.5, background: 'rgba(255,255,255,0.2)' }}>
                    <Typography variant="caption">✓ 跨页签同步</Typography>
                  </Paper>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    color="secondary"
                    component={RouterLink}
                    to="/demo"
                  >
                    进入测试演示 →
                  </Button>
                </Box>
              </Paper>

              {/* 主要内容 */}
              <TimeSlotGrid bookingStore={bookingStore} />
            </Container>
          } />
          <Route path="/demo" element={<ConcurrencyDemo />} />
        </Routes>

        {/* 用户设置对话框 */}
        <Dialog open={userDialogOpen} onClose={() => {}} disableEscapeKeyDown>
          <DialogTitle>欢迎使用预定系统</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="用户名"
              fullWidth
              variant="outlined"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              sx={{ mt: 2 }}
            />
            <TextField
              margin="dense"
              label="用户ID（可选，留空自动生成）"
              fullWidth
              variant="outlined"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              输入用户名后点击确认开始预定
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleSetUser} variant="contained" fullWidth>
              开始预定
            </Button>
          </DialogActions>
        </Dialog>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
