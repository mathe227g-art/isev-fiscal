# iSev Fiscal

O projeto processa os XMLs de NF-e localmente no navegador. Somente CNPJ, chave de acesso e UF são enviados às APIs quando o usuário solicita uma consulta externa.

## Executar localmente

Requer Node.js 22 ou superior. O PFX e sua senha são lidos somente do ambiente e nunca devem ser copiados para `dist`, Git ou o ZIP publicado.

```powershell
$env:ISEV_PFX_PATH='C:\certificados\empresa.pfx'
$env:ISEV_PFX_PASSWORD='senha-definida-no-servidor'
# Opcional localmente; obrigatório na Vercel:
$env:ISEV_ACCESS_KEY='uma-chave-longa-e-aleatoria'
npm start
```

Acesse `http://127.0.0.1:4173`. Quando `ISEV_ACCESS_KEY` estiver configurada, o navegador pedirá essa chave na primeira consulta e a manterá apenas na sessão da aba.

## Publicar na Vercel

O projeto já contém `vercel.json` e a função Node em `api/[...path].mjs`. Defina a raiz do projeto como a pasta que contém este README.

Na Vercel, configure três variáveis para **Production** e **Preview**:

- `ISEV_ACCESS_KEY`: senha longa e exclusiva que protege todas as APIs.
- `ISEV_PFX_BASE64`: conteúdo Base64 do certificado A1.
- `ISEV_PFX_PASSWORD`: senha do PFX.

Converta o certificado localmente, sem enviá-lo ao Git:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\certificados\empresa.pfx')) | Set-Clipboard
```

Cole o valor diretamente em `ISEV_PFX_BASE64` no painel da Vercel. O limite atual da Vercel para o conjunto das variáveis Node é 64 KB; o código rejeita PFX acima de 48 KB para preservar espaço para as demais variáveis.

## Controles de segurança

- APIs protegidas por chave comparada em tempo constante.
- Certificado disponível somente no servidor e TLS mínimo 1.2.
- Rate limit por IP e limites de corpo e resposta.
- Endpoints externos fixos, sem URL fornecida pelo usuário.
- CSP e cabeçalhos contra framing, MIME sniffing e vazamento de referrer.
- XML limitado a 10 MB e DTD/entidades bloqueados.
- Campos escapados antes de entrar no HTML.
- Exportação CSV protegida contra injeção de fórmulas.
- Sem banco de dados, cookies ou armazenamento persistente de XML.

O rate limit em memória reduz abuso casual, mas instâncias serverless não compartilham estado. Para um site exposto publicamente, mantenha `ISEV_ACCESS_KEY` e ative também Firewall/Deployment Protection na Vercel quando o plano permitir.

## Verificação

```powershell
npm run check
```
