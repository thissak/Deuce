import type { User } from '@prisma/client'
import type { UserDto } from '@deuce/shared'

export function toUserDto(u: User): UserDto {
  return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl }
}
