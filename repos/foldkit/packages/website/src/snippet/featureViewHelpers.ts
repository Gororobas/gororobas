import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Article = Schema.Struct({ id: Schema.String, title: Schema.String })

const Model = Schema.Struct({ articles: Schema.Array(Article) })

const Message = defineMessageUnion({ ClickedArticle: { id: Schema.String } })
const ArticlesComposition = Block.makeDefinition('Articles', {
  Model,
  Message,
}).makeComposition()
type ArticlesViewBuilder = Block.ViewBuilderFor<typeof ArticlesComposition>

const headerView = (h: ArticlesViewBuilder) => h.h2([], ['ArticlesDefinition'])

const articleCard = (article: typeof Article.Type, h: ArticlesViewBuilder) =>
  h.keyed('li')(
    article.id,
    [],
    [
      h.button(
        [h.OnClick(Message.ClickedArticle({ id: article.id }))],
        [article.title],
      ),
    ],
  )

const articleItems = (model: typeof Model.Type, h: ArticlesViewBuilder) =>
  model.articles.map(article => articleCard(article, h))

export const view = ArticlesComposition.makeView((model, h) =>
  h.section([], [headerView(h), h.ul([], articleItems(model, h))]),
)
