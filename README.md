# Controls Profile — emilia-s2

Guarde e restaure **teclas, posições das habilidades nas barras, páginas de glifos e distribuições de EP**. Interface em português, inglês e espanhol latino-americano, com detecção automática do idioma do Windows.

Esta distribuição é para o Toolbox normal e clientes PC x64 com dados compatíveis com **TERA 100.2 / protocolo 376012**, como Asura e Astrix. O Phoenix modificado mantém uma versão própria; não substitua essa versão pelo pacote padrão, pois o tratamento de EP é diferente.

## Instalação

Coloque os arquivos deste repositório em `tera-toolbox/mods/controls-profile-manager/`, com `module.json` diretamente nessa pasta. Inicie o Toolbox e o TERA. Não instale duas cópias do mod no mesmo Toolbox.

Abra com **Ctrl+Alt+K** ou `/8 controlprofile`. Se o atalho estiver ocupado por outro programa, use o comando do chat.

Atualizações automáticas estão habilitadas no pacote e usam a branch `main` deste repositório. Preferências individuais do Toolbox continuam sendo respeitadas. Após instalar uma atualização com o jogo já aberto, use `/8 toolbox reload controls-profile-manager`. Se for a primeira instalação do tratamento de EP na conexão, poderá ser necessário reabrir somente o TERA uma vez com o Toolbox aberto.

## Salvar

1. Entre no mundo com o personagem que deseja guardar.
2. Para guardar EP, abra a janela de EP do TERA e visite cada página que deseja incluir. O mod guarda somente as páginas que recebeu.
3. Abra o mod, escolha um nome e clique em **Salvar perfil**.
4. Escolha **Salvar dados recebidos** se os dados disponíveis já são os desejados. Se acabou de editar teclas ou páginas de glifos, escolha **Atualizar e salvar ao voltar**, retorne à seleção e entre no mesmo personagem em até três minutos.

O botão **Atualizar** recarrega a lista de perfis; não lê teclas recém-editadas. A janela informa o momento em que recebeu as configurações. Perfis antigos continuam válidos; salve um novo perfil para incluir funções que ainda não existiam quando o anterior foi salvo.

## Restaurar teclas, barras e glifos

Escolha o perfil e o que deseja restaurar. Clique em **Revisar aplicação**, confira as alterações e confirme a preparação. Volte à seleção de personagens e entre novamente no personagem de destino em até três minutos. Uma revisão não aplica alterações sozinha.

- **Teclas:** podem ser transferidas entre classes. Campos desconhecidos e referências específicas do destino são preservados.
- **Habilidades nas barras:** exigem a mesma classe. O mod usa habilidades confirmadas no destino, mantendo as posições e páginas salvas. Quando o nível difere, pode adaptar uma habilidade de classe para o único nível inicial compatível aprendido. IDs exatos têm prioridade; cadeias, atalhos especiais e correspondências ambíguas não recebem adaptação por aproximação.
- **Conflitos nas posições:** a revisão informa atalhos que serão substituídos por habilidades disponíveis do perfil. Itens e montarias continuam pertencendo ao personagem; somente o ícone do atalho pode mudar. Posições sem habilidade compatível são preservadas. Referências de inventário de outro personagem não são transferidas.
- **Glifos:** exigem a mesma classe, disponibilidade confirmada e catálogo local válido. As páginas mantêm seus índices. Um glifo pode ser adaptado para uma versão conhecida da mesma família, comprovada pelo catálogo. O ID exato tem prioridade; em adaptações, a maior qualidade disponível vem primeiro, seguida do menor custo, sem escolher alternativas ambíguas.
- **Pontos de glifos:** cada página respeita o orçamento recebido do jogo. A ordem salva é mantida; glifos que não cabem são omitidos, e os seguintes continuam sendo avaliados. Duas versões da mesma família não são duplicadas. A revisão mostra adaptações, omissões e custo por página.
- **Páginas sem glifos compatíveis:** são preservadas. Uma página salva explicitamente vazia pode limpar a correspondente. O mod não libera nem ativa glifos: após restaurar, selecione e ative a página no TERA para o jogo validar seus efeitos e custos.

Não são transferidos equipamentos, inventário, chat, posição das janelas, controles de gamepad ou configurações de encadeamento. O formato dos perfis do Controls Profile é separado dos perfis de aparência do Looks Profile.

Após concluir ou cancelar uma preparação, é possível revisar outra restauração. O hot-reload conserva somente os dados já recebidos do mesmo personagem na mesma conexão; revisões e operações pendentes são canceladas. Trocar de personagem ou desconectar exige receber os dados do destino novamente.

## EP — pontos de aprimoramento

Na seção EP, escolha o perfil e uma página salva. No TERA, deixe ativa a página de destino. Clique em **Revisar EP**, confira o custo e confirme a aplicação. **EP são aplicados imediatamente e só são anunciados como concluídos após confirmação do servidor. Não é necessário voltar à seleção para essa aplicação.**

O mod acrescenta somente os níveis necessários para reproduzir a página. Confere classe, custos por nível, requisitos, talentos disponíveis e pontos do destino. Se a página salva custa 415 EP, por exemplo, um destino com 427 EP totais e sem pontos aplicados pode reproduzi-la e manter 12 livres; um destino com 312 não pode. Os custos reais do cliente de destino são sempre considerados.

O mod não reduz EP, não usa poções, não compra páginas e não faz reset. Se houver níveis acima ou talentos fora do perfil, faça o reset manualmente no jogo antes. Um registro `ep-before` é salvo antes do pedido, mas **não desfaz EP confirmados**. Se não houver resposta, não existe repetição automática; confira os pontos no jogo antes de continuar.

Somente a página ativa é modificada. Visitar páginas para capturá-las e escolher a página ativa continua sendo responsabilidade do usuário. O mod não copia glifos ou distribuições de EP de outros jogadores; os perfis são dos seus próprios personagens.

## Backups e dados pessoais

Antes de restaurar configurações, o mod grava um backup local do destino. Se a gravação falhar ou os dados mudarem após a revisão, a aplicação não prossegue.

**Revisar último backup** prepara a reversão das opções do próprio personagem e servidor, com nova confirmação. Nas barras, pode recuperar os atalhos de itens, ações e montarias existentes antes da restauração. A reversão também grava um backup. Glifos do backup precisam continuar disponíveis e caber no orçamento atual.

| Arquivo ou pasta | Conteúdo |
| --- | --- |
| `profiles/` | Perfis pessoais. Para transferir, copie somente os JSON desejados para a pasta equivalente do outro mod e atualize a lista. Não sobrescreva outro perfil com o mesmo nome. |
| `backups/` | Cópias de segurança e registros anteriores à aplicação de EP. Podem conter blocos de outras preferências do personagem. |
| `logs/` | Diagnósticos locais opcionais e registros de aplicação. |
| `config.json` | Preferência pessoal de idioma, criada automaticamente pelo migrador/carregamento do mod. |

Esses dados não acompanham atualizações nem devem ser publicados. Não há limpeza automática de perfis ou backups. Guarde suas próprias cópias antes de trocar de computador.

## Idioma

O seletor fica no topo da janela: **Automático**, **Português**, **English** e **Español (Latinoamérica)**. Automático segue o Windows; idiomas não suportados usam inglês. A escolha manual tem prioridade e é salva no `config.json` pessoal. Trocar o idioma não prepara nem confirma restaurações e não renomeia perfis.

## Atalhos e comandos

| Atalho ou comando | Função |
| --- | --- |
| **Ctrl+Alt+K** | Abrir ou trazer a janela para a frente. |
| `/8 controlprofile` ou `/8 controlprofile gui` | Abrir a janela. |
| `/8 controlprofile save NOME` | Preparar o salvamento após voltar à seleção e entrar no mesmo personagem em até três minutos. |
| `/8 controlprofile status` | Mostrar versão, dados recebidos e estado do mod. |
| `/8 controlprofile cancel` | Cancelar a revisão ou preparação. |
| `/8 controlprofile language auto` | Usar o idioma automático. Também aceita `pt`, `en` e `es`. |
| `/8 toolbox reload controls-profile-manager` | Recarregar o mod na conexão atual. |
| `/8 controlprofile report` | Salvar o relatório de diagnóstico e mostrar seu caminho. |
| `/8 controlprofile start` ou `/8 controlprofile stop` | Iniciar ou pausar uma captura de diagnóstico. Não desativa os perfis. |
| `/8 controlprofile mark base` | Marcar uma captura. Também aceita `tecla`, `barra` e `restaurado`. |
| `/8 controlprofile inspectglyphs` | Consultar o catálogo local de glifos para diagnóstico. |

Os comandos opcionais `inspectep` e `inspectplayer` são ferramentas de diagnóstico. Os leitores em `native/` acompanham seu código-fonte, só são chamados explicitamente e não aplicam pontos. A leitura nativa é limitada aos clientes já validados pelo leitor; isso não restringe o suporte normal a clientes padrão por nome de servidor. Os relatórios ficam em `logs/`.

## Limites de compatibilidade

Teclas e barras foram restauradas no jogo entre Asura e Phoenix; a distribuição Phoenix continua separada. A restauração de EP pelo pacote padrão foi confirmada pelo servidor em testes no Astrix. Glifos dependem dos IDs, famílias, pontos e páginas disponíveis em cada destino: não há promessa de reproduzir uma distribuição que o outro cliente não possui.

O mod organiza configurações com revisão e confirmação; não usa habilidades, não remove limites do jogo e não oferece funcionamento integralmente local. O TERA continua salvando suas configurações normalmente no servidor.

## Preparação local da publicação

Na pasta local `D:\controls-profile-manager`, execute **sincronizar-pacote.bat** para copiar arquivos novos ou modificados de `D:\tera-toolbox\mods\controls-profile-manager`. O script gera `manifest.json` com SHA-256, confere os bytes e atualiza as regras de publicação. Arquivos de runtime retirados da origem só são removidos do pacote se ainda correspondem ao hash publicado anteriormente; alterações locais conflitantes interrompem a sincronização.

Para conferir sem alterar arquivos: `sincronizar-pacote.bat --check`. Para recalcular apenas o manifesto dos arquivos já copiados: `manifest-generator.bat`. São ferramentas locais, ignoradas pelo Git e excluídas do manifesto. Elas não fazem commit nem push.

Perfis, configurações, backups, logs, testes e temporários são excluídos da sincronização e do Git. Arquivos novos de funcionamento nas pastas permitidas entram automaticamente; mantenha testes e dados pessoais fora delas. `.gitattributes` preserva os bytes para que os hashes não mudem por conversão de fim de linha.
