export type Label = {
  id: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
}

export const LABEL_CLS: Record<string, string> = {
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  blue: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  green: 'bg-green-500/15 text-green-300 border-green-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  pink: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  gray: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
}