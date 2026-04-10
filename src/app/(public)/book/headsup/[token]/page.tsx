import { Suspense } from 'react';
import HeadsUpSlotPage from './HeadsUpSlotPage';

export default function HeadsUpPage() {
  return (
    <Suspense fallback={
      <section style={{ maxWidth: 500, margin: '0 auto', padding: 20 }}>
        <div style={{ minHeight: 300 }} />
      </section>
    }>
      <HeadsUpSlotPage />
    </Suspense>
  );
}
