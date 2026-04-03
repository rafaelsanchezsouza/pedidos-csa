import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/services/firebase'

export function useUploadProof() {
  async function uploadProof(
    file: File,
    colmeiaId: string,
    userId: string,
    month: string
  ): Promise<string> {
    if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande. Máximo: 5 MB.')
    const path = `comprovantes/${colmeiaId}/${userId}/${month}/${file.name}`
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file)
    return getDownloadURL(storageRef)
  }

  return { uploadProof }
}
