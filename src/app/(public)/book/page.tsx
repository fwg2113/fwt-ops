import type { Metadata } from 'next';
import BookingPage from './BookingPage';

export const metadata: Metadata = {
  title: 'Book An Appointment | Frederick Window Tinting',
  description: 'Choose your vehicle, select your services, and pick your appointment time. Frederick Window Tinting — trusted automotive window tinting.',
};

export default function BookPage() {
  return <BookingPage />;
}
