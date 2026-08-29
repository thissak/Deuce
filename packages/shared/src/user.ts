import { z } from 'zod'

export const UserDtoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
})

export type UserDto = z.infer<typeof UserDtoSchema>
