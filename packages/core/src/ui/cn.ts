import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Junta classes do Tailwind resolvendo conflitos (a última vence). Base dos primitives:
// é o que deixa `<Button className="bg-red-500">` sobrescrever o bg da variante.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
