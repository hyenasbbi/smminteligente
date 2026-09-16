BBI COMPANY · SMM Intelligence

DEPLOY RAPIDO EN NETLIFY
1. Descomprimir la carpeta bbi-smm-app.
2. Entrar a Netlify > Add new site > Deploy manually.
3. Arrastrar la carpeta completa.
4. Abrir la URL generada por Netlify.
5. Crear la primera cuenta desde la pantalla de registro.
6. Esa primera cuenta quedara PENDING hasta que sea convertida en ADMIN desde Supabase.

IMPORTANTE
- El frontend usa solo la publishable key de Supabase. No contiene service_role ni secretos privados.
- La base de servicios actualmente esta vacia hasta conectar JAP, HON, FLW y BLKM por API.
- Los usuarios pendientes no pueden leer la base de servicios por RLS.
- Las cuentas expulsadas quedan con el email bloqueado en la tabla smm_blocked_emails.

SIGUIENTE PASO
Conectar las API keys como secretos del backend y ejecutar sincronizacion de services/prices/status.
