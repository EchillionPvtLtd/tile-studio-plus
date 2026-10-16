'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function BackButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.back()} className={className}>
      <ArrowLeft className="h-4 w-4" />
      Go back
    </button>
  );
}
