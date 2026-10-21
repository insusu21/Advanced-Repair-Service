const pad = (n: number) => String(n).padStart(2, '0')

export function formatDateTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDate(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

export function formatRelative(iso?: string): string {
  if (!iso) return '-'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.round(h / 24)
  return `${d}일 전`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

export function confidenceLevel(v: number): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (v >= 80) return { label: '높음', tone: 'success' }
  if (v >= 60) return { label: '보통', tone: 'warning' }
  return { label: '낮음', tone: 'danger' }
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

export function isoAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

/** 업로드 이미지를 최대 1280px JPEG 로 줄여 dataURL 로 반환 (전송량·저장공간 절약) */
export async function compressImage(file: File, max = 1280, quality = 0.82): Promise<string> {
  const isSvg = file.type === 'image/svg+xml'
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  if (isSvg) return dataUrl
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
    i.src = dataUrl
  })
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 수리 건 식별자. 시리얼은 재접수 시 겹칠 수 있으므로 DB ID 로 구분한다 → "#101" */
export function repairId(id: number): string {
  return `#${id}`
}

/** "진단 리포트 #101 · RC-A100" */
export function reportTitle(repair: { id: number; product: { model: string } }): string {
  return `진단 리포트 ${repairId(repair.id)} · ${repair.product.model}`
}
