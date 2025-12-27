import React from 'react'
import {
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  Box,
  Chip,
  CircularProgress
} from '@mui/material'
import {
  CheckCircle as AvailableIcon,
  Lock as LockedIcon,
  EventSeat as BookedIcon,
  Schedule as TimeIcon
} from '@mui/icons-material'
import { observer } from 'mobx-react'
import { TimeSlot, SlotStatus } from '../types'
import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface TimeSlotCardProps {
  slot: TimeSlot
  isLockedByCurrentUser: boolean
  isPending: boolean
  onBook: (slotId: string) => Promise<void>
  disabled?: boolean
}

const statusConfig = {
  [SlotStatus.AVAILABLE]: {
    color: 'success' as const,
    icon: <AvailableIcon />,
    label: '可用',
    bgColor: '#e8f5e9'
  },
  [SlotStatus.LOCKED]: {
    color: 'warning' as const,
    icon: <LockedIcon />,
    label: '锁定中',
    bgColor: '#fff3e0'
  },
  [SlotStatus.BOOKED]: {
    color: 'error' as const,
    icon: <BookedIcon />,
    label: '已预定',
    bgColor: '#ffebee'
  },
  [SlotStatus.EXPIRED]: {
    color: 'default' as const,
    icon: <TimeIcon />,
    label: '已过期',
    bgColor: '#f5f5f5'
  }
}

export const TimeSlotCard = observer(({
  slot,
  isLockedByCurrentUser,
  isPending,
  onBook,
  disabled
}: TimeSlotCardProps) => {
  const config = statusConfig[slot.status]

  const handleClick = async () => {
    if (slot.status === SlotStatus.AVAILABLE && !disabled) {
      await onBook(slot.id)
    }
  }

  const startTime = format(parseISO(slot.startTime), 'HH:mm', { locale: zhCN })
  const endTime = format(parseISO(slot.endTime), 'HH:mm', { locale: zhCN })

  return (
    <Card
      sx={{
        cursor: slot.status === SlotStatus.AVAILABLE && !disabled ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
        opacity: disabled ? 0.6 : 1,
        '&:hover': slot.status === SlotStatus.AVAILABLE && !disabled ? {
          transform: 'translateY(-4px)',
          boxShadow: 4
        } : {},
        border: isLockedByCurrentUser ? '2px solid #2196f3' : '1px solid #e0e0e0',
        backgroundColor: config.bgColor
      }}
      onClick={handleClick}
    >
      <CardContent sx={{ pb: 1 }}>
        <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            {config.icon}
            <Typography variant="h6" component="div">
              {startTime} - {endTime}
            </Typography>
          </Box>
          <Chip
            label={config.label}
            color={config.color}
            size="small"
          />
        </Box>

        {slot.price && (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            ¥{slot.price}
          </Typography>
        )}

        {slot.bookedBy && (
          <Typography variant="caption" color="text.secondary">
            预定者: {slot.bookedBy}
          </Typography>
        )}

        {slot.lockedBy && isLockedByCurrentUser && (
          <Typography variant="caption" color="primary" display="block" sx={{ mt: 1 }}>
            您正在预定此时间段
          </Typography>
        )}

        {isPending && (
          <Box display="flex" alignItems="center" gap={1} sx={{ mt: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="primary">
              处理中...
            </Typography>
          </Box>
        )}
      </CardContent>

      {slot.status === SlotStatus.AVAILABLE && !disabled && (
        <CardActions sx={{ pt: 0, pb: 2 }}>
          <Button
            size="small"
            variant="contained"
            color="primary"
            fullWidth
            onClick={(e) => {
              e.stopPropagation()
              handleClick()
            }}
            disabled={disabled || isPending}
          >
            {isPending ? '处理中...' : '立即预定'}
          </Button>
        </CardActions>
      )}

      {slot.status === SlotStatus.LOCKED && !isLockedByCurrentUser && (
        <CardActions sx={{ pt: 0, pb: 2 }}>
          <Button size="small" variant="outlined" disabled fullWidth>
            等待其他用户...
          </Button>
        </CardActions>
      )}
    </Card>
  )
})
