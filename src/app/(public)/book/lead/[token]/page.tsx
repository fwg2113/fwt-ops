import { Suspense } from 'react';
import LeadBookingPage from './LeadBookingPage';

export default function LeadPage() {
  return (
    <Suspense fallback={
      <section style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
        <div style={{ minHeight: 300 }} />
      </section>
    }>
      <LeadBookingPage />
    </Suspense>
  );
}
