import { useQuery } from '@tanstack/react-query';
import { listDocuments } from '../lib/tauri';

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: listDocuments,
  });
}
