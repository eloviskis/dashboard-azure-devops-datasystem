# Dashboard de Performance DevOps com Backend Real

Este projeto consiste em um frontend React (construído com Vite) e um backend Node.js (com Express e SQLite) que se conectam ao Azure DevOps para buscar, armazenar e visualizar dados de performance.

## Estrutura de Pastas

```
/
├── backend/        # Contém o servidor Node.js/Express
├── frontend/       # Contém a aplicação React/Vite
└── README.md
```

## Requisitos

- Node.js (versão 18 ou superior)
- npm (geralmente vem com o Node.js)
- Um Personal Access Token (PAT) do Azure DevOps com permissões de leitura para Work Items.

## Como Rodar o Projeto Localmente

Você precisará de dois terminais abertos para rodar o backend e o frontend simultaneamente.

### Passo 1: Configurar e Rodar o Backend

1.  **Navegue até a pasta do backend:**
    ```sh
    cd backend
    ```

2.  **Instale as dependências:**
    ```sh
    npm install
    ```

3.  **Configure suas credenciais:**
    Crie um arquivo chamado `.env` na raiz da pasta `backend`. Abra este arquivo e adicione suas credenciais do Azure DevOps, substituindo os valores de exemplo:
    ```.env
    AZURE_ORG="sua-organizacao"
    AZURE_PROJECT="seu-projeto"
    AZURE_PAT="seu-personal-access-token"
    ```

4.  **Inicie o servidor backend:**
    ```sh
    npm start
    ```
    O servidor será iniciado em `http://localhost:3001`. Na primeira vez que rodar, ele fará a sincronização inicial dos dados do Azure DevOps, o que pode levar alguns minutos. Você verá logs no terminal indicando o progresso.

### Passo 2: Configurar e Rodar o Frontend

1.  **Abra um novo terminal** e navegue até a pasta do frontend:
    ```sh
    cd frontend
    ```

2.  **Instale as dependências:**
    ```sh
    npm install
    ```

3.  **Inicie o servidor de desenvolvimento do frontend:**
    ```sh
    npm run dev
    ```
    O servidor de desenvolvimento Vite será iniciado, e você verá uma URL no terminal (geralmente `http://localhost:5173`).

### Passo 3: Acesse o Dashboard

Abra a URL do frontend (ex: `http://localhost:5173`) no seu navegador. O dashboard deverá carregar e buscar os dados do seu backend local.

Parabéns! O ambiente completo está rodando na sua máquina.
