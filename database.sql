CREATE DATABASE IF NOT EXISTS jifc;
USE jifc;

-- =========================================================================
-- 1. TABELA DE CAMPUS (Instituições)
-- =========================================================================
CREATE TABLE campus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    cidade VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    foto_perfil VARCHAR(255) DEFAULT '/imagens/avatar.svg',
    ativo BOOLEAN DEFAULT TRUE, -- Evita exclusão física e perda de histórico
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 2. TABELA DE ADMINISTRADORES
-- =========================================================================
CREATE TABLE administradores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    foto_perfil VARCHAR(255) DEFAULT '/imagens/avatar.svg',
    ativo BOOLEAN DEFAULT TRUE, -- Permite desativar um administrador sem apagar dados
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 3. TABELA DE JUÍZES / ÁRBITROS
-- =========================================================================
CREATE TABLE juizes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    foto_perfil VARCHAR(255) DEFAULT '/imagens/avatar.svg',
    ativo BOOLEAN DEFAULT TRUE, -- Permite desativar um juiz sem quebrar histórico de jogos
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 4. TABELA DE MODALIDADES
-- =========================================================================
CREATE TABLE modalidades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    genero ENUM('Masculino', 'Feminino', 'Misto') NOT NULL,
    tipo_confronto ENUM('Coletivo', 'Individual') NOT NULL, 
    formato_disputa ENUM('Grupos + Mata-Mata', 'Sistema Suico', 'Baterias por Tempo') NOT NULL,
    icone VARCHAR(255) DEFAULT NULL,
    UNIQUE KEY uq_modalidade_genero (nome, genero)
);

-- =========================================================================
-- 5. TABELA DE ATLETAS (Atualizada com CPF e RG)
-- =========================================================================
CREATE TABLE atletas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campus_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    cpf CHAR(11) NOT NULL UNIQUE,          -- CPF obrigatório para segurança e seguro dos atletas 
    matricula VARCHAR(30) NOT NULL UNIQUE,
    genero ENUM('Masculino', 'Feminino') NOT NULL, -- Gênero biológico para as categorias correspondentes
    data_nascimento DATE NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE
);

-- =========================================================================
-- 6. TABELA INTERMEDIÁRIA: INSCRIÇÕES DE ATLETAS NAS MODALIDADES
-- =========================================================================
CREATE TABLE atleta_modalidade (
    atleta_id INT NOT NULL,
    modalidade_id INT NOT NULL,
    PRIMARY KEY (atleta_id, modalidade_id),
    FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE,
    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE
);

-- =========================================================================
-- 7. TABELA DE CHAVES (Grupos do torneio)
-- =========================================================================
CREATE TABLE chaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modalidade_id INT NOT NULL,
    numero_chave INT NOT NULL DEFAULT 1, 
    
    -- Geração automática da Letra do Grupo (1 -> A, 2 -> B, etc.) de forma determinística
    nome_chave CHAR(1) GENERATED ALWAYS AS (CONVERT(CHAR(numero_chave + 64) USING utf8mb4)) STORED, 
    
    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
    UNIQUE KEY uq_modalidade_numero_chave (modalidade_id, numero_chave)
);

-- =========================================================================
-- 8. TABELA INTERMEDIÁRIA: MODALIDADES QUE O CAMPUS VAI PARTICIPAR
-- =========================================================================
CREATE TABLE campus_modalidade (
    campus_id INT NOT NULL,
    modalidade_id INT NOT NULL,
    chave_id INT DEFAULT NULL, 
    PRIMARY KEY (campus_id, modalidade_id),
    FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE,
    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
    FOREIGN KEY (chave_id) REFERENCES chaves(id) ON DELETE SET NULL
);

-- =========================================================================
-- 9. TABELA DE JOGOS / CONFRONTOS
-- =========================================================================
CREATE TABLE jogos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modalidade_id INT NOT NULL,
    chave_id INT DEFAULT NULL, -- Facilitador direto para carregar a tabela daquele grupo específico
    fase ENUM('Fase de Grupos', 'Oitavas', 'Quartas', 'Semifinal', 'Final', 'Bateria Única', 'Eliminatória') NOT NULL,
    rodada INT NOT NULL DEFAULT 1,
    
    -- Participantes Coletivos
    campus_1_id INT DEFAULT NULL,
    campus_2_id INT DEFAULT NULL,
    
    -- Participantes Individuais
    atleta_1_id INT DEFAULT NULL,
    atleta_2_id INT DEFAULT NULL,

    data_hora DATETIME NOT NULL,
    local_jogo VARCHAR(100) NOT NULL,
    status ENUM('Agendado', 'Em Andamento', 'Encerrado', 'Cancelado') DEFAULT 'Agendado',
    
    -- Vencedores
    vencedor_campus_id INT DEFAULT NULL,
    vencedor_atleta_id INT DEFAULT NULL,
    
    -- Walk Over
    wo TINYINT(1) DEFAULT 0,
    
    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
    FOREIGN KEY (chave_id) REFERENCES chaves(id) ON DELETE SET NULL,
    FOREIGN KEY (campus_1_id) REFERENCES campus(id) ON DELETE CASCADE,
    FOREIGN KEY (campus_2_id) REFERENCES campus(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_1_id) REFERENCES atletas(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_2_id) REFERENCES atletas(id) ON DELETE CASCADE,
    
    FOREIGN KEY (vencedor_campus_id) REFERENCES campus(id) ON DELETE SET NULL,
    FOREIGN KEY (vencedor_atleta_id) REFERENCES atletas(id) ON DELETE SET NULL,

    -- GARANTIAS DE INTEGRIDADE (Garante coerência na escolha de equipes ou atletas)
    CONSTRAINT chk_tipo_confronto CHECK (
        -- Cenário 1: Jogo Coletivo (Campi definidos, atletas nulos)
        (campus_1_id IS NOT NULL AND campus_2_id IS NOT NULL AND atleta_1_id IS NULL AND atleta_2_id IS NULL) OR
        -- Cenário 2: Jogo Individual (Atletas definidos, campi nulos)
        (atleta_1_id IS NOT NULL AND atleta_2_id IS NOT NULL AND campus_1_id IS NULL AND campus_2_id IS NULL) OR
        -- Cenário 3: Jogo indefinido (Gera o jogo vazio previamente para preencher conforme o torneio avança)
        (campus_1_id IS NULL AND campus_2_id IS NULL AND atleta_1_id IS NULL AND atleta_2_id IS NULL)
    ),
    
    -- Garante que um campus ou atleta nunca jogue contra si mesmo
    CONSTRAINT chk_confronto_duplicado CHECK (
        (campus_1_id <> campus_2_id) OR (atleta_1_id <> atleta_2_id)
    )
);

-- =========================================================================
-- 10. TABELA PARA ESPORTES COLETIVOS TRADICIONAIS
-- =========================================================================
CREATE TABLE resultados_coletivos (
    jogo_id INT PRIMARY KEY,
    placar_1 INT NOT NULL DEFAULT 0, 
    placar_2 INT NOT NULL DEFAULT 0, 
    FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE
);

-- =========================================================================
-- 11. TABELA PARA ESPORTES POR SETS
-- =========================================================================
CREATE TABLE resultados_por_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jogo_id INT NOT NULL,
    numero_set INT NOT NULL, 
    pontos_1 INT NOT NULL DEFAULT 0, 
    pontos_2 INT NOT NULL DEFAULT 0, 
    FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
    UNIQUE KEY uq_jogo_set (jogo_id, numero_set)
);

-- =========================================================================
-- 12. TABELA PARA CORRIDAS / ATLETISMO / NATAÇÃO
-- =========================================================================
CREATE TABLE resultados_atletismo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jogo_id INT NOT NULL, 
    atleta_id INT NOT NULL,
    resultado_tempo TIME(3) DEFAULT NULL, 
    resultado_medida DECIMAL(5,2) DEFAULT NULL, 
    posicao_final INT DEFAULT NULL, 
    FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE
);

-- =========================================================================
-- 13. CONFIGURAÇÕES DO EVENTO (Validação cronológica das etapas)
-- =========================================================================
CREATE TABLE configuracoes_evento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ano_evento INT NOT NULL DEFAULT 2026,
    inicio_inscricao_modalidades DATE NOT NULL,
    fim_inscricao_modalidades DATE NOT NULL,
    inicio_inscricao_atletas DATE NOT NULL,
    fim_inscricao_atletas DATE NOT NULL,
    inicio_sorteio_chaves DATE NOT NULL,
    fim_sorteio_chaves DATE NOT NULL,
    
    -- Garante que as etapas respeitem uma ordem de datas lógica no fluxo do evento
    CONSTRAINT chk_fluxo_cronologico CHECK (
        inicio_inscricao_modalidades <= fim_inscricao_modalidades AND
        fim_inscricao_modalidades <= inicio_inscricao_atletas AND
        inicio_inscricao_atletas <= fim_inscricao_atletas AND
        fim_inscricao_atletas <= inicio_sorteio_chaves AND
        inicio_sorteio_chaves <= fim_sorteio_chaves
    )
);

-- =========================================================================
-- 14. TABELA DE CLASSIFICAÇÃO / PONTUAÇÃO GERAL (Fase de Grupos)
-- =========================================================================
CREATE TABLE classificacao_grupos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modalidade_id INT NOT NULL,
    chave_id INT NOT NULL,
    
    campus_id INT DEFAULT NULL,
    atleta_id INT DEFAULT NULL,
    
    pontos INT DEFAULT 0,
    jogos_jogados INT DEFAULT 0,
    vitorias INT DEFAULT 0,
    empates INT DEFAULT 0,       
    derrotas INT DEFAULT 0,
    
    pontos_pro INT DEFAULT 0,
    pontos_contra INT DEFAULT 0,
    saldo_pontuacao INT GENERATED ALWAYS AS (pontos_pro - pontos_contra) STORED,
    
    cartoes_amarelos INT DEFAULT 0,
    cartoes_vermelhos INT DEFAULT 0,
    sets_ganhos INT DEFAULT 0,
    sets_perdidos INT DEFAULT 0,

    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
    FOREIGN KEY (chave_id) REFERENCES chaves(id) ON DELETE CASCADE,
    FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE,
    
    CONSTRAINT uq_participante_por_chave UNIQUE (chave_id, campus_id, atleta_id),
    
    CONSTRAINT chk_tipo_participante_classificacao CHECK (
        (campus_id IS NOT NULL AND atleta_id IS NULL) OR
        (atleta_id IS NOT NULL AND campus_id IS NULL)
    )
);

-- =========================================================================
-- 15. TABELA DE CARTÕES (Fair Play)
-- =========================================================================
CREATE TABLE cartoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jogo_id INT NOT NULL,
    campus_id INT NOT NULL,
    tipo ENUM('amarelo', 'vermelho') NOT NULL,
    jogador_nome VARCHAR(100) DEFAULT NULL,
    minuto INT DEFAULT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
    FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE
);