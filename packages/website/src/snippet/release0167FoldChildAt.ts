import { Array, Option } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

const foldApplicant = Update.foldChildAt({
  update: Applicant.update,
  readAt: (model: typeof Model.Type, entryId: string) =>
    Option.map(
      Array.findFirst(model.applicants, applicant => applicant.id === entryId),
      applicant => applicant.entry,
    ),
  writeAt: (model, entryId, nextEntry) =>
    modifyFields(model, {
      applicants: Array.map(applicant =>
        applicant.id === entryId
          ? modifyFields(applicant, { entry: () => nextEntry })
          : applicant,
      ),
    }),
  toParentMessage: (entryId, message) =>
    Message.GotApplicantMessage({ entryId, message }),
})

const update = (model: typeof Model.Type, message: Message) =>
  Message.match<Update.Return<typeof Model.Type, Message>>(message, {
    GotApplicantMessage: ({ entryId, message }) =>
      foldApplicant(model, entryId, message),
  })
