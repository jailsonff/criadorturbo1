import type { AppProps } from 'next/app';
import { createGlobalStyle, ThemeProvider } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  body {
    background: #181A1B;
    color: #FFF;
    font-family: 'Montserrat', Arial, Helvetica, sans-serif;
    margin: 0;
    padding: 0;
  }
  a {
    color: #FFF;
    text-decoration: none;
    transition: color 0.2s;
  }
  a:hover {
    color: #FFD600;
  }
`;

const theme = {
  colors: {
    primary: '#FFD600',
    background: '#181A1B',
    text: '#FFF',
    secondary: '#E0E0E0',
  },
};

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
