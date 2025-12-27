import React from 'react'
import {
  Grid,
  Box,
  Typography,
  Alert,
  Snackbar,
  Paper,
  Chip,
  Divider
} from '@mui/material'
import { observer } from 'mobx-react'
import { BookingStore } from '../stores/BookingStore'
import { TimeSlotCard } from './TimeSlotCard'
import { SlotStatus } from '../types'
import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface TimeSlotGridProps {
  bookingStore: BookingStore
}

export const TimeSlotGrid = observer(({ bookingStore }: TimeSlotGridProps) => {
  const [snackbarOpen, setSnackbarOpen] = React.useState(false)
  const [snackbarMessage, setSnackbarMessage] = React.useState('')

  const sortedSlots = bookingStore.getSortedSlots()
  const pendingBookings = bookingStore.getPendingBookings()

  const groupedSlots = sortedSlots.reduce((groups, slot) => {
    const date = format(parseISO(slot.startTime), 'yyyy年MM月dd日 EEEE', { locale: zhCN })
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(slot)
    return groups
  }, {} as Record<string, typeof sortedSlots>)

  const handleBookSlot = async (slotId: string) => {
    const result = await bookingStore.bookSlot(slotId)

    if (result.success) {
      setSnackbarMessage('预定成功！')
    } else {
      setSnackbarMessage(result.error || '预定失败')
    }
    setSnackbarOpen(true)
  }

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false)
  }

  if (bookingStore.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>加载中...</Typography>
      </Box>
    )
  }

  if (sortedSlots.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography color="text.secondary">暂无可用时间段</Typography>
      </Box>
    )
  }

  return (
    <Box>
      {bookingStore.currentUser && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">当前用户</Typography>
              <Typography variant="body2" color="text.secondary">
                {bookingStore.currentUser.name} (ID: {bookingStore.currentUser.id})
              </Typography>
            </Box>
            <Box display="flex" gap={1} alignItems="center">
              {pendingBookings.length > 0 && (
                <Chip
                  label={`${pendingBookings.length} 个待处理预定`}
                  color="warning"
                  size="small"
                />
              )}
            </Box>
          </Box>
        </Paper>
      )}

      {bookingStore.error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => bookingStore.clearError()}>
          {bookingStore.error}
        </Alert>
      )}

      {Object.entries(groupedSlots).map(([date, dateSlots]) => (
        <Box key={date} sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Divider sx={{ flex: 1 }} />
            <Chip label={date} color="primary" />
            <Divider sx={{ flex: 1 }} />
          </Typography>

          <Grid container spacing={2}>
            {dateSlots.map((slot) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={slot.id}>
                <TimeSlotCard
                  slot={slot}
                  isLockedByCurrentUser={bookingStore.isSlotLockedByCurrentUser(slot.id)}
                  isPending={bookingStore.hasPendingBookings() && bookingStore.getPendingBookings().some(p => p.id === slot.id)}
                  onBook={handleBookSlot}
                  disabled={bookingStore.hasPendingBookings()}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}

      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="subtitle2" gutterBottom>实时状态统计</Typography>
        <Box display="flex" gap={2} flexWrap="wrap">
          <Chip
            label={`可用: ${sortedSlots.filter(s => s.status === SlotStatus.AVAILABLE).length}`}
            color="success"
            size="small"
          />
          <Chip
            label={`锁定: ${sortedSlots.filter(s => s.status === SlotStatus.LOCKED).length}`}
            color="warning"
            size="small"
          />
          <Chip
            label={`已预定: ${sortedSlots.filter(s => s.status === SlotStatus.BOOKED).length}`}
            color="error"
            size="small"
          />
          <Chip
            label={`总计: ${sortedSlots.length}`}
            color="default"
            size="small"
          />
        </Box>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        message={snackbarMessage}
      />
    </Box>
  )
})
