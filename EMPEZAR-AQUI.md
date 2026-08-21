# EMPEZAR ACÁ

Para levantar la V1 necesitás hacer solamente esto:

1. Crear un proyecto gratuito en **Supabase**.
2. Abrir **SQL Editor**, pegar `supabase/schema.sql` completo y ejecutarlo.
3. Copiar `.env.example` como `.env.local` y pegar la URL y la Publishable Key de Supabase.
4. En la terminal, dentro del proyecto:
   ```bash
   npm install
   npm run dev
   ```
5. Entrar a `http://localhost:3000`, tocar **Crear usuario** y registrar tu cuenta. El primer usuario será Administrador.
6. Cuando funcione local, subir la carpeta a GitHub e importar ese repositorio en Vercel. En Vercel hay que cargar las mismas dos variables de entorno.

La guía detallada está en `README.md`.

## Si nunca usaste esto antes

- **Node.js**: bajalo de [nodejs.org](https://nodejs.org) (versión 22 o superior).
- **Supabase**: es la base de datos + login. Es gratis para este tamaño de proyecto. Creá la cuenta en [supabase.com](https://supabase.com).
- **Vercel**: es donde queda publicada la app para que la usen desde el celular. También gratis para este uso. Cuenta en [vercel.com](https://vercel.com).
- **GitHub**: donde vive el código. Cuenta en [github.com](https://github.com).

El orden siempre es: Supabase primero (base de datos) → probar local → GitHub → Vercel.
