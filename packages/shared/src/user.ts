import { z } from 'zod'

export const UserDtoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  isAgent: z.boolean().optional(),
  avatarUrl: z.string().nullable(),
})

export type UserDto = z.infer<typeof UserDtoSchema>
