import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dashboardApi, toErrorMessage } from '@/api'
import type { DefectRecord, DrillDim } from '@/api/dashboard'
import type { DefectDashboard } from '@/types'

export const useDashboardStore = defineStore('dashboard', () => {
  const data = ref<DefectDashboard | null>(null)
  const months = ref(6)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const drill = ref<{ dim: DrillDim; value: string; label: string } | null>(null)
  const records = ref<DefectRecord[]>([])
  const recordsLoading = ref(false)

  async function fetch() {
    loading.value = true
    error.value = null
    try {
      data.value = await dashboardApi.defects(months.value)
    } catch (e) {
      error.value = toErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  async function drillDown(dim: DrillDim, value: string, label: string) {
    drill.value = { dim, value, label }
    recordsLoading.value = true
    try {
      records.value = await dashboardApi.records(dim, value)
    } catch (e) {
      error.value = toErrorMessage(e)
    } finally {
      recordsLoading.value = false
    }
  }

  function clearDrill() {
    drill.value = null
    records.value = []
  }

  return { data, months, loading, error, drill, records, recordsLoading, fetch, drillDown, clearDrill }
})
