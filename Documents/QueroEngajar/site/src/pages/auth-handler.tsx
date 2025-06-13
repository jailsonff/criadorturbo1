import { useEffect } from 'react';
import { useRouter } from 'next/router';

const USUARIO_LOGADO_KEY = 'usuario_logado';

export default function AuthHandler() {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      const { user: encodedUser } = router.query;

      if (encodedUser && typeof encodedUser === 'string') {
        try {
          const userJson = atob(encodedUser); // Decode from Base64
          const user = JSON.parse(userJson);
          
          // Save user to localStorage
          localStorage.setItem(USUARIO_LOGADO_KEY, JSON.stringify(user));
          
          // Redirect to dashboard
          router.push('/dashboard');
        } catch (error) {
          console.error('Failed to handle auth:', error);
          // Redirect to login on error
          router.push('/login');
        }
      } else {
        // No user data, redirect to login
        router.push('/login');
      }
    }
  }, [router.isReady, router.query, router]);

  return <div>Autenticando...</div>;
}
