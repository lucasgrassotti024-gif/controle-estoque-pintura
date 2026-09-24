import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('__session')?.value;

  if (session && session.trim().length > 0) {
    redirect('/estoque');
  } else {
    redirect('/login');
  }
}
