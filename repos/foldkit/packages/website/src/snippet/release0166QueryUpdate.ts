import { Update } from 'foldkit'

const posts = postsQuery.lift<typeof Model.Type, Message>({
  parentField: 'posts',
  toParentMessage: message => Message.GotPostsMessage({ message }),
})

const init = () => {
  const model = Model.make({ posts: postsQuery.init() })

  return posts.loadIfMissing(model)
}

const update = (model: typeof Model.Type, message: Message) =>
  Message.match<Update.Return<typeof Model.Type, Message>>(message, {
    GotPostsMessage: ({ message }) => posts.fold(model, message),
    ClickedRefreshPosts: () => posts.revalidateOrLoad(model),
  })
