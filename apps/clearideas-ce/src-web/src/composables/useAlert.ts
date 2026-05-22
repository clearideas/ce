import 'vue3-toastify/dist/index.css'

import { ref } from 'vue'
import type { ToastTheme } from 'vue3-toastify'
import { toast } from 'vue3-toastify'

export interface Alert {
  id: number
  message: string
  type: 'error' | 'success' | 'warning' | 'info' | undefined
  timeout: number | false
}

export const alertTheme = ref('light')

const offlineToastIds = ref<Set<string | number>>(new Set())

export function updateAlertTheme(themeName: string) {
  alertTheme.value = themeName === 'dark' ? 'dark' : 'light'
}

export function useAlert() {
  const alerts = ref<Alert[]>([])

  const add = (alert: Omit<Alert, 'id'>) => {
    const id = Date.now()
    const newAlert = { ...alert, id }

    let autoCloseValue: number | false
    if (newAlert.timeout === false) {
      autoCloseValue = false
    } else if (typeof newAlert.timeout === 'number' && newAlert.timeout > 0) {
      autoCloseValue = Number(newAlert.timeout)
    } else {
      autoCloseValue = 5000
    }

    return toast(newAlert.message, {
      type: newAlert.type,
      position: 'top-center',
      hideProgressBar: true,
      transition: 'slide',
      autoClose: autoCloseValue,
      closeOnClick: true,
      closeButton: true,
      pauseOnHover: true,
      theme: alertTheme.value as ToastTheme,
    })
  }

  const addOfflineToast = (alert: Omit<Alert, 'id'>) => {
    const toastId = add(alert)
    if (toastId !== undefined) offlineToastIds.value.add(toastId)
    return toastId
  }

  const remove = (id: number) => {
    alerts.value = alerts.value.filter((alert: Alert) => alert.id !== id)
  }

  const dismissOfflineToasts = () => {
    offlineToastIds.value.forEach(toastId => {
      toast.remove(toastId)
    })
    offlineToastIds.value.clear()
  }

  return { add, addOfflineToast, remove, alerts, dismissOfflineToasts }
}
