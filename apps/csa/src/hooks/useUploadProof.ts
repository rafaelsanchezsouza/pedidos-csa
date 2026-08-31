import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/services/firebase'

export function useUploadProof() {
  async function uploadProof(
    file: File,
    tenantId: string,
    userId: string,
    month: string
  ): Promise<string> {
    if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande. Máximo: 5 MB.')
    // Carimbo no nome: o caminho antigo era `.../{mês}/{nome do arquivo}`, então dois envios
    // com o mesmo nome no mesmo mês se sobrescreviam em silêncio e o comprovante anterior
    // sumia. Com 1 envio por mês era raro; na acolhida são 4 ou 5, e nome repetido
    // ('comprovante.jpg', 'IMG-20260830-WA0001.jpg') é o caso comum, não a exceção.
    const seguro = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `comprovantes/${tenantId}/${userId}/${month}/${Date.now()}-${seguro}`
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file)
    return getDownloadURL(storageRef)
  }

  return { uploadProof }
}
