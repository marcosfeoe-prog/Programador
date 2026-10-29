# Tornadopédia — Wiki de Tornados Fictícios

Wiki estática (HTML + CSS + JS, sem dependências) sobre tornados **inventados**, ilustrada com
imagens geradas por IA.

```bash
npm start   # na raiz do repositório
```

Depois abra `http://localhost:8080/wiki/`.

## Escala de classificação

| Classe | Nome          | Ventos             |
|--------|---------------|--------------------|
| FU     | Sem classe    | Não classificado   |
| F0     | Fraco         | 60–144 km/h        |
| F1     | Moderado      | 145–192 km/h       |
| F2     | Considerável  | 193–265 km/h       |
| F3     | Severo        | 266–322 km/h       |
| F4     | Devastador    | 323–421 km/h       |
| F5     | Inacreditável | 422 km/h ou mais   |

## Páginas

- Página principal, artigo em destaque e contagem por classe
- Artigos com infobox, índice, seção de classificação e o prompt da imagem de IA
- Lista de todos os tornados e categorias por classe/formato
- Escala com calculadora de classe por velocidade do vento
- Galeria de imagens, pesquisa e artigo aleatório
- **Criar artigo**: escreva seu próprio tornado e envie uma imagem (salvo no navegador)

## Imagens

As imagens em `imagens/ia/` foram geradas por IA (Canva). Os artigos sem imagem ainda
usam uma ilustração desenhada pelo navegador (`js/ilustracao.js`) e mostram o prompt
sugerido. Para adicionar ou trocar uma imagem, coloque o arquivo em `imagens/ia/` e
preencha o campo `imagem` do artigo em `js/dados.js`.
