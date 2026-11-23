# Controls Profile Phoenix

Guarde e restaure **teclas, posições das habilidades nas barras, páginas de glifos e distribuições de EP** dos seus personagens.

## Atalhos e comandos

| Atalho ou comando | Função |
| --- | --- |
| **Ctrl+Alt+K** ou `!controlprofile` | Abrir a janela do mod. |
| `!controlprofile save NOME` | Preparar o salvamento para quando você voltar ao personagem. |
| `!controlprofile status` | Conferir os dados recebidos e o estado do mod. |
| `!controlprofile cancel` | Cancelar a revisão ou preparação. |

## Instalação

Use esta cópia com o Toolbox preparado para o **TERA Phoenix 100.2 (PC x64, protocolo 376012)**. A edição padrão permite usar teclas, barras e glifos no Phoenix, mas a aplicação de EP nesse cliente fica disponível na cópia adaptada.

1. Coloque os arquivos em `tera-toolbox/mods/controls-profile-manager/`, com `module.json` diretamente nessa pasta.
2. Abra o Toolbox em modo gráfico e depois inicie o Phoenix. Use uma única cópia do mod por Toolbox.

Depois de atualizar os arquivos do mod, reabra o Phoenix para carregar a versão nova e receber os dados do personagem.

## Salvar um perfil

1. Entre no mundo com o personagem de origem. Para incluir EP, visite na janela do TERA cada página que deseja guardar.
2. Abra o Controls Profile, escolha um nome e clique em **Salvar perfil**.
3. Use **Salvar dados recebidos** se o mod já recebeu a configuração desejada. Se acabou de mudar teclas ou páginas de glifos, escolha **Atualizar e salvar ao voltar**. Volte à seleção e entre no mesmo personagem em até três minutos para salvar.

O botão **Atualizar** recarrega a lista de perfis. Para salvar alterações recentes, use **Atualizar e salvar ao voltar**. Os perfis antigos continuam válidos. Para incluir dados que faltam, salve um novo perfil.

## Restaurar teclas, barras e glifos

Escolha o perfil e o que deseja restaurar. Clique em **Revisar aplicação**, confira o resumo e confirme a preparação. Volte à seleção e reentre no personagem de destino em até três minutos.

- **Teclas** podem ser transferidas entre classes.
- **Barras** exigem a mesma classe. O mod mantém as posições nas páginas salvas e usa as habilidades disponíveis no destino, adaptando o nível quando há uma correspondência inequívoca. Se um item ou montaria ocupar uma posição necessária, a revisão avisa que o atalho será substituído. O item ou a montaria continua com o personagem.
- **Glifos** exigem a mesma classe e respeitam os pontos e as opções disponíveis em cada página. O mod pode usar outra versão disponível do mesmo glifo. A revisão mostra as adaptações e os glifos que ficaram de fora. Páginas sem glifos compatíveis são preservadas. Uma página salva vazia pode limpar a correspondente. Depois de restaurar, selecione e ative a página no TERA.

Ao escolher teclas, barras e glifos juntos, a revisão mostra o que pode ser restaurado e o que ficou de fora. Assim, um personagem sem glifos disponíveis ainda pode receber teclas e habilidades compatíveis.

**Importar um perfil do Asura** · Copie o JSON desejado da pasta `profiles/` do mod no Asura para a pasta equivalente no Phoenix e clique em **Atualizar**. Os mesmos arquivos podem ser copiados no sentido inverso. Distribuições de EP só aparecem em perfis que as incluíram no salvamento.

## EP — pontos de aprimoramento

1. No TERA, deixe ativa a página de destino.
2. No mod, escolha um perfil com EP e a página salva que deseja usar.
3. Clique em **Revisar EP**, confira o custo e confirme. Os pontos são aplicados na página ativa assim que o servidor confirma, sem voltar à seleção.

O mod acrescenta apenas os níveis necessários. O mod usa os custos, níveis e requisitos do Phoenix para revisar a distribuição, inclusive quando ela veio do Asura. O personagem precisa ser da mesma classe, ter os talentos exigidos e ter pontos suficientes no destino.

Se a página já tem talentos fora da distribuição ou níveis acima dos salvos, faça o reset manual no TERA antes de tentar. Pontos confirmados só podem ser reduzidos pelo reset do jogo. Se o servidor demorar a responder, confira os pontos no TERA antes de tentar novamente.

## Backups e dados pessoais

Antes de uma restauração, o mod salva a configuração do personagem de destino. Use **Revisar último backup** para recuperar teclas, barras ou glifos do mesmo personagem e servidor. Glifos ainda precisam estar disponíveis e caber nos pontos atuais. Para EP, o mod guarda um registro da distribuição anterior para consulta.

| Pasta ou arquivo | O que contém |
| --- | --- |
| `profiles/` | Perfis pessoais. Para transferir, copie os JSON desejados para a pasta correspondente e atualize a lista. |
| `backups/` | Backups das configurações e registros anteriores à aplicação de EP. |
| `logs/` | Diagnósticos e registros de aplicação. |
| `config.json` | Preferência de idioma. |

Guarde uma cópia dos seus perfis e backups ao trocar de computador. Esses arquivos são pessoais e devem ficar fora da publicação.

## Idioma

Escolha **Português**, **English**, **Español (Latinoamérica)** ou **Automático**. A escolha fica salva. O modo automático segue o idioma do Windows e usa inglês quando o idioma do sistema está fora da lista.
