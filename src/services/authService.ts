import { supabase } from '../lib/supabaseClient';
import { Cargo, PerfilUsuario, StatusConta } from '../types';

/*
 * SQL DE CRIAÇÃO DO BANCO DE DADOS — ACESSO & PERMISSÕES
 * =======================================================
 * Execute no SQL Editor do seu projeto Supabase, em DUAS ETAPAS SEPARADAS —
 * elas têm janelas de risco diferentes para quem já usa o app hoje, sem login.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ PARTE 1 — pode rodar A QUALQUER MOMENTO, inclusive antes do merge.     │
 * │ Só cria coisas novas (tabela, coluna, funções) que o app de hoje nem   │
 * │ sabe que existem — não muda nada do que já está no ar.                │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * -- 1) Tabela de perfis (dados de negócio de cada usuário; a senha em si fica
 * --    guardada, criptografada, pelo próprio Supabase Auth — nunca aqui).
 * CREATE TABLE perfis (
 *   id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 *   email TEXT NOT NULL,
 *   nome_completo TEXT NOT NULL,
 *   telefone TEXT NOT NULL,
 *   cpf TEXT NOT NULL,
 *   imobiliaria TEXT NOT NULL,
 *   creci TEXT,
 *   cargo TEXT NOT NULL,
 *   superior_id UUID REFERENCES perfis(id) ON DELETE SET NULL,
 *   status TEXT NOT NULL DEFAULT 'pendente',
 *   telas_liberadas TEXT[] NOT NULL DEFAULT '{}',
 *   ver_propostas_equipe BOOLEAN NOT NULL DEFAULT false,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * -- 2) Gatilho: assim que uma conta é criada no Supabase Auth (signUp), cria
 * --    automaticamente a linha correspondente em `perfis`, lendo os dados do
 * --    cadastro (nome, CPF, cargo etc.) que o app manda como metadata. É o
 * --    banco fazendo essa gravação por dentro (SECURITY DEFINER), então não
 * --    esbarra na regra de segurança que só libera o próprio usuário depois
 * --    que ele confirma o e-mail (nesse momento inicial ainda não há sessão).
 * CREATE OR REPLACE FUNCTION public.handle_new_user()
 * RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 * BEGIN
 *   INSERT INTO public.perfis (id, email, nome_completo, telefone, cpf, imobiliaria, creci, cargo, status, telas_liberadas, ver_propostas_equipe)
 *   VALUES (
 *     NEW.id,
 *     NEW.email,
 *     COALESCE(NEW.raw_user_meta_data->>'nome_completo', ''),
 *     COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
 *     COALESCE(NEW.raw_user_meta_data->>'cpf', ''),
 *     COALESCE(NEW.raw_user_meta_data->>'imobiliaria', ''),
 *     NEW.raw_user_meta_data->>'creci',
 *     COALESCE(NEW.raw_user_meta_data->>'cargo', 'Corretor'),
 *     'pendente',
 *     '{}',
 *     false
 *   );
 *   RETURN NEW;
 * END;
 * $$;
 * CREATE TRIGGER on_auth_user_created
 *   AFTER INSERT ON auth.users
 *   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
 *
 * -- 3) Coluna de "dono" em cada simulação salva, para saber quem criou e
 * --    permitir a visão por hierarquia (Gerente/Diretor vendo a equipe).
 * ALTER TABLE simulacoes ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;
 *
 * -- 4) Função auxiliar: este usuário é um Administrador ativo? Precisa ser
 * --    SECURITY DEFINER para não cair em recursão infinita quando usada
 * --    dentro de uma policy da própria tabela `perfis`.
 * CREATE OR REPLACE FUNCTION public.is_admin(usuario_id UUID)
 * RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
 *   SELECT EXISTS (
 *     SELECT 1 FROM perfis WHERE id = usuario_id AND cargo = 'Administrador' AND status = 'ativo'
 *   );
 * $$;
 *
 * -- 5) Função auxiliar: lista os ids de todos os subordinados (diretos e
 * --    indiretos) de um usuário, sem expor nome/CPF/telefone de ninguém —
 * --    é o que permite Gerente/Diretor verem as propostas da equipe. O limite
 * --    de profundidade (20 níveis) é só uma proteção contra um ciclo acidental
 * --    de "superior hierárquico" travar a consulta; a tela de Administrador já
 * --    evita criar ciclos ao escolher o superior de alguém.
 * CREATE OR REPLACE FUNCTION public.subordinados_de(usuario_id UUID)
 * RETURNS TABLE(id UUID) LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
 *   WITH RECURSIVE arvore AS (
 *     SELECT p.id, 1 AS profundidade FROM perfis p WHERE p.superior_id = usuario_id
 *     UNION ALL
 *     SELECT p.id, a.profundidade + 1 FROM perfis p INNER JOIN arvore a ON p.superior_id = a.id
 *     WHERE a.profundidade < 20
 *   )
 *   SELECT id FROM arvore;
 * $$;
 *
 * -- 5b) Igual à de cima, mas também traz NOME, CARGO, IMOBILIÁRIA e o
 * --     SUPERIOR de cada subordinado — é o que permite mostrar "Feito por:
 * --     <nome> — <cargo> — <imobiliária>" e filtrar por "Gerente
 * --     responsável" nas propostas da equipe, sem dar acesso ao perfil
 * --     completo (CPF, telefone, e-mail) de quem está abaixo dele. Se você
 * --     já rodou uma versão anterior desta função, rode a linha de DROP
 * --     abaixo antes do CREATE — o Postgres não deixa trocar as colunas de
 * --     retorno de uma função existente sem apagar e recriar.
 * DROP FUNCTION IF EXISTS public.nomes_subordinados_de(UUID);
 * CREATE OR REPLACE FUNCTION public.nomes_subordinados_de(usuario_id UUID)
 * RETURNS TABLE(id UUID, nome_completo TEXT, cargo TEXT, imobiliaria TEXT, superior_id UUID) LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
 *   WITH RECURSIVE arvore AS (
 *     SELECT p.id, 1 AS profundidade FROM perfis p WHERE p.superior_id = usuario_id
 *     UNION ALL
 *     SELECT p.id, a.profundidade + 1 FROM perfis p INNER JOIN arvore a ON p.superior_id = a.id
 *     WHERE a.profundidade < 20
 *   )
 *   SELECT p.id, p.nome_completo, p.cargo, p.imobiliaria, p.superior_id FROM perfis p WHERE p.id IN (SELECT id FROM arvore);
 * $$;
 * GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
 * GRANT EXECUTE ON FUNCTION public.subordinados_de(UUID) TO authenticated;
 * GRANT EXECUTE ON FUNCTION public.nomes_subordinados_de(UUID) TO authenticated;
 *
 * -- 6) Segurança por linha (RLS) da tabela de perfis.
 * ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "ver_proprio_perfil_ou_admin_ve_todos" ON perfis
 *   FOR SELECT USING (auth.uid() = id OR public.is_admin(auth.uid()));
 * -- Cadastro público só pode criar o PRÓPRIO perfil, e sempre como pendente
 * -- (impede alguém de se autoaprovar mandando status=ativo pela requisição).
 * CREATE POLICY "cadastro_cria_proprio_perfil_pendente" ON perfis
 *   FOR INSERT WITH CHECK (auth.uid() = id AND status = 'pendente');
 * -- Só o Administrador aprova, muda cargo/hierarquia/permissões, pausa ou exclui.
 * CREATE POLICY "admin_atualiza_qualquer_perfil" ON perfis
 *   FOR UPDATE USING (public.is_admin(auth.uid()));
 * CREATE POLICY "admin_exclui_qualquer_perfil" ON perfis
 *   FOR DELETE USING (public.is_admin(auth.uid()));
 * -- (RLS na tabela `perfis` é segura de ligar já: o app de hoje, no ar, nunca
 * -- lê nem grava nessa tabela — só o código deste PR usa ela.)
 *
 * -- 6b) Coluna com os campos do cadastro (ver CAMPOS_EDITAVEIS_EQUIPE em
 * --     src/config/telasApp.ts) que este usuário está autorizado, pelo
 * --     Administrador, a editar no cadastro de quem está abaixo dele na
 * --     hierarquia — ex.: um Gerente autorizado a corrigir só telefone e
 * --     imobiliária dos próprios corretores.
 * ALTER TABLE perfis ADD COLUMN IF NOT EXISTS campos_editaveis_equipe TEXT[] NOT NULL DEFAULT '{}';
 *
 * -- 6c) Função protegida que aplica a edição do cadastro de um subordinado.
 * --     Roda como SECURITY DEFINER (o Diretor/Gerente comum não tem permissão
 * --     de UPDATE direta em `perfis` — só o Administrador tem, pela policy
 * --     "admin_atualiza_qualquer_perfil"), mas revalida TUDO por dentro antes
 * --     de gravar qualquer coisa: (1) `subordinado_id` precisa estar na árvore
 * --     de `subordinados_de(auth.uid())`, senão nem é gente de baixo dele; (2)
 * --     cada campo só é gravado se a chave correspondente estiver presente no
 * --     `campos_editaveis_equipe` do próprio usuário logado — ou seja, a
 * --     autorização é sempre a que o Administrador concedeu, nunca a que o
 * --     app manda pedindo. Isso é o que garante a regra mesmo que alguém tente
 * --     chamar a função direto, pulando a tela.
 * CREATE OR REPLACE FUNCTION public.editar_cadastro_subordinado(
 *   subordinado_id UUID,
 *   novo_nome TEXT DEFAULT NULL,
 *   novo_telefone TEXT DEFAULT NULL,
 *   novo_cpf TEXT DEFAULT NULL,
 *   nova_imobiliaria TEXT DEFAULT NULL,
 *   novo_creci TEXT DEFAULT NULL,
 *   limpar_creci BOOLEAN DEFAULT FALSE,
 *   novo_cargo TEXT DEFAULT NULL,
 *   novo_superior_id UUID DEFAULT NULL,
 *   limpar_superior BOOLEAN DEFAULT FALSE,
 *   novas_telas TEXT[] DEFAULT NULL,
 *   novos_empreendimentos TEXT[] DEFAULT NULL,
 *   limpar_empreendimentos BOOLEAN DEFAULT FALSE
 * ) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 * DECLARE
 *   permissoes TEXT[];
 * BEGIN
 *   IF NOT EXISTS (SELECT 1 FROM public.subordinados_de(auth.uid()) WHERE id = subordinado_id) THEN
 *     RAISE EXCEPTION 'Esse usuário não está na sua hierarquia.';
 *   END IF;
 *
 *   SELECT campos_editaveis_equipe INTO permissoes FROM perfis WHERE id = auth.uid();
 *
 *   IF novo_nome IS NOT NULL THEN
 *     IF NOT ('nome' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar o nome.'; END IF;
 *     UPDATE perfis SET nome_completo = novo_nome WHERE id = subordinado_id;
 *   END IF;
 *   IF novo_telefone IS NOT NULL THEN
 *     IF NOT ('telefone' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar o telefone.'; END IF;
 *     UPDATE perfis SET telefone = novo_telefone WHERE id = subordinado_id;
 *   END IF;
 *   IF novo_cpf IS NOT NULL THEN
 *     IF NOT ('cpf' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar o CPF.'; END IF;
 *     UPDATE perfis SET cpf = novo_cpf WHERE id = subordinado_id;
 *   END IF;
 *   IF nova_imobiliaria IS NOT NULL THEN
 *     IF NOT ('imobiliaria' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar a imobiliária.'; END IF;
 *     UPDATE perfis SET imobiliaria = nova_imobiliaria WHERE id = subordinado_id;
 *   END IF;
 *   IF novo_creci IS NOT NULL OR limpar_creci THEN
 *     IF NOT ('creci' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar o CRECI.'; END IF;
 *     UPDATE perfis SET creci = CASE WHEN limpar_creci THEN NULL ELSE novo_creci END WHERE id = subordinado_id;
 *   END IF;
 *   IF novo_cargo IS NOT NULL THEN
 *     IF NOT ('cargo' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar o cargo.'; END IF;
 *     UPDATE perfis SET cargo = novo_cargo WHERE id = subordinado_id;
 *   END IF;
 *   IF novo_superior_id IS NOT NULL OR limpar_superior THEN
 *     IF NOT ('superior' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar o superior hierárquico.'; END IF;
 *     UPDATE perfis SET superior_id = CASE WHEN limpar_superior THEN NULL ELSE novo_superior_id END WHERE id = subordinado_id;
 *   END IF;
 *   IF novas_telas IS NOT NULL THEN
 *     IF NOT ('telas' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar as telas liberadas.'; END IF;
 *     UPDATE perfis SET telas_liberadas = novas_telas WHERE id = subordinado_id;
 *   END IF;
 *   IF novos_empreendimentos IS NOT NULL OR limpar_empreendimentos THEN
 *     IF NOT ('empreendimentos' = ANY(permissoes)) THEN RAISE EXCEPTION 'Sem permissão para editar os empreendimentos liberados.'; END IF;
 *     UPDATE perfis SET empreendimentos_liberados = CASE WHEN limpar_empreendimentos THEN NULL ELSE novos_empreendimentos END WHERE id = subordinado_id;
 *   END IF;
 *
 *   RETURN TRUE;
 * END;
 * $$;
 *
 * -- 6d) Lista, para quem tem ALGUMA permissão de campos_editaveis_equipe, os
 * --     próprios subordinados com os dados básicos necessários pra montar o
 * --     formulário de edição na tela (sem CPF completo nem e-mail — só o que
 * --     é de fato editável). Quem não tem nenhum campo autorizado recebe uma
 * --     lista vazia, mesmo que tente chamar a função direto — é uma segunda
 * --     camada de proteção, além da tela só mostrar a seção pra quem tem
 * --     `camposEditaveisEquipe` não vazio.
 * -- Atenção: como esta função é `plpgsql` e usa RETURNS TABLE(id UUID, ...),
 * -- o Postgres declara `id` como variável interna automaticamente — uma
 * -- referência a `id` sem qualificar a tabela (ex.: `WHERE id = usuario_id`)
 * -- fica ambígua entre a coluna `perfis.id` e essa variável, e a função falha
 * -- (com erro) toda vez que é chamada. Por isso o alias `pf` abaixo é
 * -- obrigatório, não cosmético.
 * -- Atenção: se você já rodou uma versão anterior desta função (antes do campo
 * -- `empreendimentos_liberados` existir), rode a linha de DROP abaixo antes do
 * -- CREATE — mesmo motivo do aviso de nomes_subordinados_de logo acima.
 * DROP FUNCTION IF EXISTS public.dados_equipe_para_edicao(UUID);
 * CREATE OR REPLACE FUNCTION public.dados_equipe_para_edicao(usuario_id UUID)
 * RETURNS TABLE(id UUID, nome_completo TEXT, telefone TEXT, cpf TEXT, imobiliaria TEXT, creci TEXT, cargo TEXT, superior_id UUID, telas_liberadas TEXT[], empreendimentos_liberados TEXT[])
 * LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 * BEGIN
 *   IF usuario_id <> auth.uid() THEN
 *     RAISE EXCEPTION 'Só é possível consultar a própria equipe.';
 *   END IF;
 *   IF NOT EXISTS (SELECT 1 FROM perfis pf WHERE pf.id = usuario_id AND array_length(pf.campos_editaveis_equipe, 1) > 0) THEN
 *     RETURN;
 *   END IF;
 *   RETURN QUERY
 *     SELECT p.id, p.nome_completo, p.telefone, p.cpf, p.imobiliaria, p.creci, p.cargo, p.superior_id, p.telas_liberadas, p.empreendimentos_liberados
 *     FROM perfis p WHERE p.id IN (SELECT sub.id FROM public.subordinados_de(usuario_id) sub);
 * END;
 * $$;
 *
 * GRANT EXECUTE ON FUNCTION public.editar_cadastro_subordinado(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID, BOOLEAN, TEXT[], TEXT[], BOOLEAN) TO authenticated;
 * GRANT EXECUTE ON FUNCTION public.dados_equipe_para_edicao(UUID) TO authenticated;
 *
 * -- 6f) Empreendimentos (produtos) que cada usuário tem permissão de ver e usar
 * --     nas simulações — controla, por hierarquia, quem enxerga qual produto. Regra:
 * --     NULL = "segue automaticamente a hierarquia" (herda do superior direto, subindo
 * --     até achar alguém com uma lista definida, ou até o padrão do cargo de quem está
 * --     no topo). Qualquer array, mesmo vazio, é uma trava manual explícita — vence
 * --     sempre a herança, até que alguém edite de novo para "seguir automaticamente".
 * ALTER TABLE perfis ADD COLUMN IF NOT EXISTS empreendimentos_liberados TEXT[] NULL;
 *
 * -- Padrão por cargo: usado só quando a busca acima chega ao topo da hierarquia (a
 * --     pessoa não tem superior) e ainda assim não encontrou nenhuma trava manual no
 * --     caminho — nesse caso, cai no padrão configurado para o cargo dessa pessoa do
 * --     topo. Sem linha para o cargo (ou tabela vazia) = sem restrição nenhuma, mostra
 * --     todos os empreendimentos (mesmo default seguro usado em toda parte do app).
 * CREATE TABLE IF NOT EXISTS empreendimentos_padrao_por_cargo (
 *   cargo TEXT PRIMARY KEY,
 *   empreendimentos_liberados TEXT[] NOT NULL DEFAULT '{}'
 * );
 * ALTER TABLE empreendimentos_padrao_por_cargo ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "logados_leem_empreendimentos_padrao_por_cargo" ON empreendimentos_padrao_por_cargo
 *   FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "admin_grava_empreendimentos_padrao_por_cargo" ON empreendimentos_padrao_por_cargo
 *   FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
 *
 * -- Função que resolve, em tempo real (sempre lida do banco, nunca uma cópia
 * --     congelada), a lista efetiva de empreendimentos liberados para o próprio
 * --     usuário logado — sobe a árvore de `superior_id` até achar a primeira trava
 * --     manual (empreendimentos_liberados NOT NULL); se chegar ao topo sem achar
 * --     nenhuma, cai no padrão do cargo de quem está no topo. NULL de volta = sem
 * --     nenhuma restrição configurada em lugar nenhum da cadeia (o app mostra todos os
 * --     empreendimentos, é o default seguro). Só é possível consultar o próprio id —
 * --     mesma trava de `dados_equipe_para_edicao`.
 * CREATE OR REPLACE FUNCTION public.empreendimentos_liberados_efetivos(usuario_id UUID)
 * RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 * DECLARE
 *   atual_id UUID;
 *   atual_lista TEXT[];
 *   atual_cargo TEXT;
 *   profundidade INT := 0;
 * BEGIN
 *   IF usuario_id <> auth.uid() THEN
 *     RAISE EXCEPTION 'Só é possível consultar os próprios empreendimentos liberados.';
 *   END IF;
 *
 *   atual_id := usuario_id;
 *   WHILE atual_id IS NOT NULL AND profundidade < 20 LOOP
 *     SELECT p.empreendimentos_liberados, p.cargo, p.superior_id
 *       INTO atual_lista, atual_cargo, atual_id
 *       FROM perfis p WHERE p.id = atual_id;
 *
 *     IF atual_lista IS NOT NULL THEN
 *       RETURN atual_lista;
 *     END IF;
 *
 *     IF atual_id IS NULL THEN
 *       RETURN (SELECT epc.empreendimentos_liberados FROM empreendimentos_padrao_por_cargo epc WHERE epc.cargo = atual_cargo);
 *     END IF;
 *
 *     profundidade := profundidade + 1;
 *   END LOOP;
 *
 *   RETURN NULL;
 * END;
 * $$;
 * GRANT EXECUTE ON FUNCTION public.empreendimentos_liberados_efetivos(UUID) TO authenticated;
 *
 * -- 6e) Proprietário: existe no máximo UM usuário com proprietario=true no
 * --     sistema inteiro (índice único abaixo garante isso no banco, não só na
 * --     tela). É quem "é dono" do aplicativo — mesmo sendo Administrador como
 * --     qualquer outro, só ele mesmo pode editar, pausar ou excluir o próprio
 * --     cadastro; nenhum outro Administrador consegue tocar nele. A troca de
 * --     dono só acontece pela função transferir_propriedade, nunca por um
 * --     UPDATE comum — o gatilho abaixo BLOQUEIA qualquer tentativa de mudar
 * --     essa coluna fora dessa função, mesmo vinda do próprio dono editando a
 * --     si mesmo por engano.
 * ALTER TABLE perfis ADD COLUMN IF NOT EXISTS proprietario BOOLEAN NOT NULL DEFAULT false;
 * CREATE UNIQUE INDEX IF NOT EXISTS um_unico_proprietario ON perfis ((proprietario)) WHERE proprietario = true;
 *
 * -- Defina o dono inicial (troque o e-mail abaixo se não for o seu):
 * UPDATE perfis SET proprietario = true WHERE email = 'calazansvendas@gmail.com';
 *
 * CREATE OR REPLACE FUNCTION public.protege_coluna_proprietario()
 * RETURNS TRIGGER LANGUAGE plpgsql AS $$
 * BEGIN
 *   IF NEW.proprietario IS DISTINCT FROM OLD.proprietario
 *      AND COALESCE(current_setting('app.permitir_transferencia', true), '') <> 'true' THEN
 *     NEW.proprietario := OLD.proprietario;
 *   END IF;
 *   RETURN NEW;
 * END;
 * $$;
 * DROP TRIGGER IF EXISTS trg_protege_proprietario ON perfis;
 * CREATE TRIGGER trg_protege_proprietario
 *   BEFORE UPDATE ON perfis
 *   FOR EACH ROW EXECUTE FUNCTION public.protege_coluna_proprietario();
 *
 * -- Substitui as policies de UPDATE/DELETE de `perfis` (item 6 acima) para que
 * -- nenhum Administrador comum consiga editar ou excluir a linha do dono —
 * -- exceto o próprio dono editando a si mesmo.
 * DROP POLICY IF EXISTS "admin_atualiza_qualquer_perfil" ON perfis;
 * CREATE POLICY "admin_atualiza_perfil_exceto_dono_alheio" ON perfis
 *   FOR UPDATE USING (public.is_admin(auth.uid()) AND (auth.uid() = id OR NOT proprietario));
 * DROP POLICY IF EXISTS "admin_exclui_qualquer_perfil" ON perfis;
 * CREATE POLICY "admin_exclui_perfil_exceto_dono" ON perfis
 *   FOR DELETE USING (public.is_admin(auth.uid()) AND NOT proprietario);
 *
 * -- Única forma de trocar o dono: o dono atual chama esta função apontando
 * -- para outro Administrador ativo. Ela mesma libera, só durante a própria
 * -- transação, a trava do gatilho acima (set_config com is_local=true — a
 * -- liberação desaparece sozinha ao fim da transação, nunca vaza para outras
 * -- chamadas).
 * CREATE OR REPLACE FUNCTION public.transferir_propriedade(novo_proprietario_id UUID)
 * RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 * DECLARE
 *   sou_dono BOOLEAN;
 *   alvo_valido BOOLEAN;
 * BEGIN
 *   SELECT proprietario INTO sou_dono FROM perfis WHERE id = auth.uid();
 *   IF NOT COALESCE(sou_dono, false) THEN
 *     RAISE EXCEPTION 'Só o proprietário atual pode transferir a propriedade.';
 *   END IF;
 *   IF novo_proprietario_id = auth.uid() THEN
 *     RAISE EXCEPTION 'Escolha outra pessoa para receber a propriedade.';
 *   END IF;
 *   SELECT (cargo = 'Administrador' AND status = 'ativo') INTO alvo_valido FROM perfis WHERE id = novo_proprietario_id;
 *   IF NOT COALESCE(alvo_valido, false) THEN
 *     RAISE EXCEPTION 'O novo proprietário precisa ser um Administrador ativo.';
 *   END IF;
 *
 *   PERFORM set_config('app.permitir_transferencia', 'true', true);
 *   UPDATE perfis SET proprietario = false WHERE id = auth.uid();
 *   UPDATE perfis SET proprietario = true WHERE id = novo_proprietario_id;
 *
 *   RETURN TRUE;
 * END;
 * $$;
 * GRANT EXECUTE ON FUNCTION public.transferir_propriedade(UUID) TO authenticated;
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ PARTE 2 — NÃO RODAR AINDA. Só execute isto no exato momento em que o  │
 * │ merge deste PR for para produção (ou logo em seguida). `empreendimen- │
 * │ tos`, `unidades` e `simulacoes` são usadas pelo app QUE JÁ ESTÁ NO AR, │
 * │ sem login — os usuários de hoje acessam essas tabelas sem autenticar. │
 * │ Ligar aqui "exige estar logado" antes do código novo estar publicado  │
 * │ derruba, na hora, o Simulador e as Políticas & Empreendimentos para   │
 * │ todo mundo que usa o app agora.                                       │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * -- 7) Segurança por linha da tabela de simulações: cada um vê as próprias;
 * --    Administrador vê todas; quem tem "ver_propostas_equipe" ligado também
 * --    vê as de toda a equipe abaixo dele na hierarquia.
 * ALTER TABLE simulacoes ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "ve_proprias_ou_equipe_ou_admin" ON simulacoes
 *   FOR SELECT USING (
 *     criado_por = auth.uid()
 *     OR public.is_admin(auth.uid())
 *     OR (
 *       COALESCE((SELECT ver_propostas_equipe FROM perfis WHERE id = auth.uid()), false)
 *       AND criado_por IN (SELECT id FROM public.subordinados_de(auth.uid()))
 *     )
 *   );
 * CREATE POLICY "cria_propria_simulacao" ON simulacoes
 *   FOR INSERT WITH CHECK (criado_por = auth.uid());
 * CREATE POLICY "exclui_propria_ou_admin" ON simulacoes
 *   FOR DELETE USING (criado_por = auth.uid() OR public.is_admin(auth.uid()));
 * -- Atenção: simulações salvas ANTES desta migração não têm criado_por (ficam
 * -- NULL) — elas continuam visíveis só para o Administrador até lá.
 *
 * -- 6g) Condições comerciais liberadas no dropdown "Selecionar Condição" do
 * --     Simulador de Crédito (ver CONDICOES_APP em src/config/telasApp.ts) —
 * --     controle independente de `telas_liberadas` (o menu lateral): uma tela
 * --     pode estar liberada no menu sem a condição aparecer neste dropdown, e
 * --     vice-versa. Backfill com TODAS as condições para não tirar acesso de
 * --     ninguém que já usa o app hoje — o Administrador restringe depois, cargo
 * --     a cargo ou pessoa a pessoa, pela nova seção "Condições Comerciais
 * --     Liberadas (Dropdown)" no Painel do Administrador.
 * ALTER TABLE perfis ADD COLUMN IF NOT EXISTS condicoes_liberadas TEXT[] NOT NULL DEFAULT ARRAY[
 *   'sinal-morar', 'simulador-simplificado', 'sinal-morar-comissao-apartada',
 *   'simulador-simplificado-comissao-apartada', 'banco-direto',
 *   'banco-direto-comissao-apartada', 'parcelamento-morar'
 * ]::TEXT[];
 *
 * -- 8) Trava as tabelas de empreendimentos/unidades para exigir login (hoje
 * --    qualquer pessoa com a chave pública do projeto conseguia ler/gravar
 * --    direto, sem passar pelo app). Deixamos a checagem fina de "quem edita
 * --    Políticas" a cargo do app (aba só aparece pra quem tem a tela liberada);
 * --    aqui só fechamos a porta para quem nem logado está.
 * ALTER TABLE empreendimentos ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "logados_leem_empreendimentos" ON empreendimentos FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "logados_gravam_empreendimentos" ON empreendimentos FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
 * CREATE POLICY "logados_leem_unidades" ON unidades FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "logados_gravam_unidades" ON unidades FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
 */

interface PerfilRow {
  id: string;
  email: string;
  nome_completo: string;
  telefone: string;
  cpf: string;
  imobiliaria: string;
  creci: string | null;
  cargo: Cargo;
  superior_id: string | null;
  status: StatusConta;
  telas_liberadas: string[] | null;
  condicoes_liberadas: string[] | null;
  ver_propostas_equipe: boolean | null;
  campos_editaveis_equipe: string[] | null;
  empreendimentos_liberados: string[] | null;
  proprietario: boolean | null;
  created_at?: string;
}

// O cargo "Corretor Novato" foi renomeado para "Corretor Parceiro" só no
// código (types.ts/telasApp.ts) — linhas já gravadas no Supabase antes dessa
// mudança continuam com a string antiga até alguém rodar um UPDATE manual na
// tabela `perfis`. Normaliza aqui, na fronteira leitura-do-banco, para que a
// label exibida (cabeçalho, listagens de equipe etc.) já saia corrigida
// mesmo antes dessa migração de dados.
function normalizarCargoLegado(cargo: Cargo): Cargo {
  return (cargo as string) === 'Corretor Novato' ? 'Corretor Parceiro' : cargo;
}

function rowParaPerfil(row: PerfilRow): PerfilUsuario {
  return {
    id: row.id,
    email: row.email,
    nomeCompleto: row.nome_completo,
    telefone: row.telefone,
    cpf: row.cpf,
    imobiliaria: row.imobiliaria,
    creci: row.creci || undefined,
    cargo: normalizarCargoLegado(row.cargo),
    superiorId: row.superior_id,
    status: row.status,
    telasLiberadas: row.telas_liberadas || [],
    condicoesLiberadas: row.condicoes_liberadas || [],
    verPropostasEquipe: !!row.ver_propostas_equipe,
    camposEditaveisEquipe: row.campos_editaveis_equipe || [],
    empreendimentosLiberados: row.empreendimentos_liberados,
    proprietario: !!row.proprietario,
    createdAt: row.created_at
  };
}

export interface MembroEquipeEditavel {
  id: string;
  nomeCompleto: string;
  telefone: string;
  cpf: string;
  imobiliaria: string;
  creci?: string;
  cargo: Cargo;
  superiorId: string | null;
  telasLiberadas: string[];
  empreendimentosLiberados: string[] | null;
}

export interface DadosCadastro {
  nomeCompleto: string;
  telefone: string;
  email: string;
  cpf: string;
  imobiliaria: string;
  creci?: string;
  cargo: Cargo;
  senha: string;
}

export const authService = {
  // Cria o usuário no Supabase Auth (dispara o e-mail de confirmação). Os
  // dados do cadastro (nome, CPF, cargo etc.) vão junto como metadata do
  // próprio usuário do Auth — é o gatilho `handle_new_user` (ver SQL acima)
  // que cria a linha em `perfis` a partir daí, direto no banco. Isso evita
  // depender do app tentar gravar em `perfis` logo em seguida: nesse momento
  // ainda não existe sessão (o Supabase só libera sessão após a confirmação
  // do e-mail), então uma gravação feita pelo app aqui esbarraria sempre nas
  // regras de segurança (RLS) da tabela.
  async cadastrar(dados: DadosCadastro): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: dados.email,
        password: dados.senha,
        options: {
          data: {
            nome_completo: dados.nomeCompleto,
            telefone: dados.telefone,
            cpf: dados.cpf,
            imobiliaria: dados.imobiliaria,
            creci: dados.creci || null,
            cargo: dados.cargo
          }
        }
      });
      if (error) return { success: false, error: error.message };
      if (!data.user) {
        return { success: false, error: 'Não foi possível criar o usuário. Tente novamente.' };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Erro ao criar o cadastro.' };
    }
  },

  async entrar(email: string, senha: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async sair(): Promise<void> {
    await supabase.auth.signOut();
  },

  async recuperarSenha(email: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async meuPerfil(userId: string): Promise<PerfilUsuario | null> {
    const { data, error } = await supabase.from('perfis').select('*').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    return rowParaPerfil(data as PerfilRow);
  },

  // --- Painel do Administrador ---------------------------------------------

  async listarPendentes(): Promise<PerfilUsuario[]> {
    const { data, error } = await supabase.from('perfis').select('*').eq('status', 'pendente').order('created_at', { ascending: true });
    if (error || !data) return [];
    return data.map(rowParaPerfil);
  },

  async listarAtivosEPausados(): Promise<PerfilUsuario[]> {
    const { data, error } = await supabase.from('perfis').select('*').in('status', ['ativo', 'pausado']).order('nome_completo', { ascending: true });
    if (error || !data) return [];
    return data.map(rowParaPerfil);
  },

  // Aprova um cadastro pendente, já definindo cargo/superior/telas confirmados
  // pelo Administrador (que pode corrigir o que a pessoa indicou no cadastro).
  async aprovarUsuario(id: string, ajustes: {
    cargo: Cargo; superiorId: string | null; telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean;
    camposEditaveisEquipe?: string[];
  }) {
    const { error } = await supabase.from('perfis').update({
      status: 'ativo',
      cargo: ajustes.cargo,
      superior_id: ajustes.superiorId,
      telas_liberadas: ajustes.telasLiberadas,
      condicoes_liberadas: ajustes.condicoesLiberadas,
      ver_propostas_equipe: ajustes.verPropostasEquipe,
      campos_editaveis_equipe: ajustes.camposEditaveisEquipe ?? []
    }).eq('id', id);
    return { success: !error, error: error?.message };
  },

  async recusarUsuario(id: string) {
    const { error } = await supabase.from('perfis').delete().eq('id', id);
    return { success: !error, error: error?.message };
  },

  async editarCargoEPermissoes(id: string, ajustes: {
    cargo: Cargo; superiorId: string | null; telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean;
    nomeCompleto: string; telefone: string; cpf: string; imobiliaria: string; creci?: string;
    camposEditaveisEquipe: string[]; empreendimentosLiberados: string[] | null;
  }) {
    const { error } = await supabase.from('perfis').update({
      cargo: ajustes.cargo,
      superior_id: ajustes.superiorId,
      telas_liberadas: ajustes.telasLiberadas,
      condicoes_liberadas: ajustes.condicoesLiberadas,
      ver_propostas_equipe: ajustes.verPropostasEquipe,
      nome_completo: ajustes.nomeCompleto,
      telefone: ajustes.telefone,
      cpf: ajustes.cpf,
      imobiliaria: ajustes.imobiliaria,
      creci: ajustes.creci || null,
      campos_editaveis_equipe: ajustes.camposEditaveisEquipe,
      empreendimentos_liberados: ajustes.empreendimentosLiberados
    }).eq('id', id);
    return { success: !error, error: error?.message };
  },

  /*
   * SQL DE CRIAÇÃO DO BANCO DE DADOS — PERMISSÕES PADRÃO POR CARGO
   * ================================================================================
   * Execute no SQL Editor do seu projeto Supabase — seguro rodar a qualquer
   * momento (só cria uma tabela nova, isolada das demais). Guarda o que o
   * Administrador configurou em "Editar permissões por cargo" (telas
   * liberadas, ver propostas da equipe, campos editáveis da equipe) como o
   * PADRÃO do cargo — independente de quantas contas esse cargo tem hoje.
   * É o que faz "Salvar" funcionar mesmo com 0 usuários vinculados: antes,
   * sem esta tabela, aplicarPermissoesPorCargo só dava UPDATE nas contas já
   * existentes daquele cargo — com 0 contas, o clique não persistia nada em
   * lugar nenhum. Agora ele grava aqui sempre, e é daqui que a aprovação de
   * um cadastro pendente (handleAprovar em AdminPanelView.tsx) e a
   * pré-preenchida do próprio painel de permissões passam a ler o padrão do
   * cargo, em vez do array TELAS_PADRAO_POR_CARGO fixo no código-fonte
   * (config/telasApp.ts, que continua servindo só de último fallback,
   * quando nem esta tabela nem nenhuma conta existente têm nada configurado).
   * A coluna condicoes_liberadas guarda, no mesmo padrão, o default por cargo
   * das condições comerciais liberadas no dropdown "Selecionar Condição"
   * (ver CONDICOES_APP em src/config/telasApp.ts).
   * CREATE TABLE IF NOT EXISTS permissoes_padrao_por_cargo (
   *   cargo TEXT PRIMARY KEY,
   *   telas_liberadas TEXT[] NOT NULL DEFAULT '{}',
   *   condicoes_liberadas TEXT[] NOT NULL DEFAULT '{}',
   *   ver_propostas_equipe BOOLEAN NOT NULL DEFAULT false,
   *   campos_editaveis_equipe TEXT[] NOT NULL DEFAULT '{}',
   *   atualizado_em TIMESTAMPTZ DEFAULT now()
   * );
   * ALTER TABLE permissoes_padrao_por_cargo ADD COLUMN IF NOT EXISTS condicoes_liberadas TEXT[] NOT NULL DEFAULT '{}';
   * ALTER TABLE permissoes_padrao_por_cargo ENABLE ROW LEVEL SECURITY;
   * CREATE POLICY "logados_leem_permissoes_padrao_por_cargo" ON permissoes_padrao_por_cargo
   *   FOR SELECT USING (auth.role() = 'authenticated');
   * CREATE POLICY "admin_grava_permissoes_padrao_por_cargo" ON permissoes_padrao_por_cargo
   *   FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
   */
  // `error` só vem preenchido numa falha real de leitura (ex.: a tabela ainda
  // não existe no Supabase porque o SQL acima não foi rodado) — nesse caso
  // `dados` volta vazio e quem chama decide se avisa o Administrador, em vez
  // de a tela cair nos padrões de fábrica sem explicação nenhuma.
  async carregarPermissoesPadraoPorCargo(): Promise<{
    dados: Partial<Record<Cargo, {
      telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean; camposEditaveisEquipe: string[];
    }>>;
    error?: string;
  }> {
    const { data, error } = await supabase.from('permissoes_padrao_por_cargo').select('*');
    if (error) return { dados: {}, error: error.message };
    const resultado: Partial<Record<Cargo, { telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean; camposEditaveisEquipe: string[] }>> = {};
    (data as any[]).forEach(row => {
      resultado[row.cargo as Cargo] = {
        telasLiberadas: row.telas_liberadas || [],
        condicoesLiberadas: row.condicoes_liberadas || [],
        verPropostasEquipe: !!row.ver_propostas_equipe,
        camposEditaveisEquipe: row.campos_editaveis_equipe || []
      };
    });
    return { dados: resultado };
  },

  // Aplica a mesma política de permissões (telas liberadas, ver propostas da
  // equipe, campos editáveis da equipe) para TODO MUNDO que tem este cargo
  // hoje (ativo ou pausado) — sobrescrevendo qualquer ajuste individual que
  // essas pessoas já tivessem — E grava a mesma configuração como o padrão
  // deste cargo em permissoes_padrao_por_cargo, para que cadastros futuros
  // aprovados com este cargo já nasçam com essas regras. As duas gravações
  // sempre acontecem juntas, mesmo quando não há NENHUMA conta com o cargo
  // hoje (afetados = 0): é assim que o botão "Salvar" continua fazendo
  // sentido nesse caso — a configuração é o padrão do cargo, não uma edição
  // que precisa de alguém para "cair em cima". Dados pessoais (nome, CPF,
  // superior etc.) não entram aqui, só ficam mesmo na edição individual.
  async aplicarPermissoesPorCargo(cargo: Cargo, ajustes: {
    telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean; camposEditaveisEquipe: string[];
  }): Promise<{ success: boolean; error?: string; afetados?: number }> {
    const [{ data, error }, { error: errorPadrao }] = await Promise.all([
      supabase.from('perfis').update({
        telas_liberadas: ajustes.telasLiberadas,
        condicoes_liberadas: ajustes.condicoesLiberadas,
        ver_propostas_equipe: ajustes.verPropostasEquipe,
        campos_editaveis_equipe: ajustes.camposEditaveisEquipe
      }).eq('cargo', cargo).in('status', ['ativo', 'pausado']).select('id'),
      supabase.from('permissoes_padrao_por_cargo').upsert({
        cargo,
        telas_liberadas: ajustes.telasLiberadas,
        condicoes_liberadas: ajustes.condicoesLiberadas,
        ver_propostas_equipe: ajustes.verPropostasEquipe,
        campos_editaveis_equipe: ajustes.camposEditaveisEquipe,
        atualizado_em: new Date().toISOString()
      }, { onConflict: 'cargo' })
    ]);
    return { success: !error && !errorPadrao, error: error?.message || errorPadrao?.message, afetados: data?.length ?? 0 };
  },

  // --- Edição do cadastro da equipe (Diretor/Gerente autorizado) -----------

  // Lista os subordinados de `usuarioId` com os dados necessários para montar
  // o formulário de edição — só retorna algo se o próprio usuário logado tiver
  // ao menos um campo autorizado em `camposEditaveisEquipe` (ver função
  // `dados_equipe_para_edicao` no SQL acima).
  async listarEquipeParaEdicao(usuarioId: string): Promise<{ dados: MembroEquipeEditavel[]; error?: string }> {
    const { data, error } = await supabase.rpc('dados_equipe_para_edicao', { usuario_id: usuarioId });
    if (error) return { dados: [], error: error.message };
    return {
      dados: ((data as any[]) || []).map(row => ({
        id: row.id,
        nomeCompleto: row.nome_completo,
        telefone: row.telefone,
        cpf: row.cpf,
        imobiliaria: row.imobiliaria,
        creci: row.creci || undefined,
        cargo: normalizarCargoLegado(row.cargo),
        superiorId: row.superior_id,
        telasLiberadas: row.telas_liberadas || [],
        empreendimentosLiberados: row.empreendimentos_liberados
      }))
    };
  },

  // Aplica a edição de um subordinado, campo a campo — só os campos
  // efetivamente enviados (não-undefined) são gravados, e a função no banco
  // (`editar_cadastro_subordinado`) revalida a autorização de cada um antes de
  // aplicar, então esta chamada nunca é a última linha de defesa.
  async editarCadastroSubordinado(subordinadoId: string, ajustes: {
    nomeCompleto?: string; telefone?: string; cpf?: string; imobiliaria?: string;
    creci?: string | null; cargo?: Cargo; superiorId?: string | null; telasLiberadas?: string[];
    empreendimentosLiberados?: string[] | null;
  }): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.rpc('editar_cadastro_subordinado', {
      subordinado_id: subordinadoId,
      novo_nome: ajustes.nomeCompleto ?? null,
      novo_telefone: ajustes.telefone ?? null,
      novo_cpf: ajustes.cpf ?? null,
      nova_imobiliaria: ajustes.imobiliaria ?? null,
      novo_creci: ajustes.creci ?? null,
      limpar_creci: ajustes.creci === null,
      novo_cargo: ajustes.cargo ?? null,
      novo_superior_id: ajustes.superiorId ?? null,
      limpar_superior: ajustes.superiorId === null,
      novas_telas: ajustes.telasLiberadas ?? null,
      novos_empreendimentos: ajustes.empreendimentosLiberados ?? null,
      limpar_empreendimentos: ajustes.empreendimentosLiberados === null
    });
    return { success: !error, error: error?.message };
  },

  async definirStatus(id: string, status: StatusConta) {
    const { error } = await supabase.from('perfis').update({ status }).eq('id', id);
    return { success: !error, error: error?.message };
  },

  // Remove o acesso da pessoa em definitivo (apaga o perfil, então ela some do
  // app e de qualquer hierarquia). O login dela em si (Supabase Auth) só é
  // apagado de fato com uma função de servidor à parte — não é algo seguro de
  // fazer com a chave pública usada aqui; se um dia for necessário liberar o
  // mesmo e-mail para um cadastro novo do zero, isso pede esse passo extra.
  async excluirUsuario(id: string) {
    const { error } = await supabase.from('perfis').delete().eq('id', id);
    return { success: !error, error: error?.message };
  },

  // --- Propriedade do aplicativo ---------------------------------------

  // Só quem já é o proprietário atual consegue chamar com sucesso (a função
  // no banco revalida isso de novo, por dentro — ver transferir_propriedade
  // no SQL acima). `novoProprietarioId` precisa ser um Administrador ativo.
  async transferirPropriedade(novoProprietarioId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.rpc('transferir_propriedade', { novo_proprietario_id: novoProprietarioId });
    return { success: !error, error: error?.message };
  },

  // --- Empreendimentos liberados (acesso por hierarquia) --------------------

  // Resolve, em tempo real, a lista efetiva de empreendimentos que o próprio
  // usuário logado pode ver — nunca uma cópia congelada (ver função no SQL
  // acima). `null` de volta (ou qualquer erro de rede/consulta) significa "sem
  // restrição configurada", o mesmo default seguro usado em todo o app: uma
  // falha aqui nunca deve travar ninguém para fora dos próprios produtos.
  async empreendimentosLiberadosEfetivos(usuarioId: string): Promise<string[] | null> {
    const { data, error } = await supabase.rpc('empreendimentos_liberados_efetivos', { usuario_id: usuarioId });
    if (error) return null;
    return (data as string[] | null) ?? null;
  },

  // Lê o padrão de empreendimentos liberados configurado para cada cargo (usado
  // só quando a hierarquia não encontra nenhuma trava manual no caminho). Um
  // cargo sem linha na tabela não aparece no resultado — o chamador deve tratar
  // isso como "sem restrição", igual a uma lista vazia não é a mesma coisa.
  async listarEmpreendimentosPadraoPorCargo(): Promise<Record<string, string[]>> {
    const { data, error } = await supabase.from('empreendimentos_padrao_por_cargo').select('*');
    if (error || !data) return {};
    const resultado: Record<string, string[]> = {};
    data.forEach((row: { cargo: string; empreendimentos_liberados: string[] }) => {
      resultado[row.cargo] = row.empreendimentos_liberados || [];
    });
    return resultado;
  },

  async salvarEmpreendimentosPadraoPorCargo(cargo: Cargo, empreendimentosLiberados: string[]): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('empreendimentos_padrao_por_cargo').upsert(
      { cargo, empreendimentos_liberados: empreendimentosLiberados },
      { onConflict: 'cargo' }
    );
    return { success: !error, error: error?.message };
  },

  // Remove a trava do cargo (volta a "sem restrição" — o mesmo que nunca ter
  // sido configurado).
  async removerEmpreendimentosPadraoPorCargo(cargo: Cargo): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('empreendimentos_padrao_por_cargo').delete().eq('cargo', cargo);
    return { success: !error, error: error?.message };
  }
};
