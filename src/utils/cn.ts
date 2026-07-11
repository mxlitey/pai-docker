// shadcn/ui 标准 cn 工具：clsx 合并 + tailwind-merge 去重
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
