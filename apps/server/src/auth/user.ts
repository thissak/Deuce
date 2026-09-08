import { prisma } from '../db.js'
import type { GoogleProfile } from './google.js'

// 기존 이메일 계정은 첫 검증 로그인에서만 Google sub에 연결한다.
// 조건부 UPDATE로 다른 sub의 기존 연결을 덮어쓰지 않는다.
export async function googleUser(profile: GoogleProfile) {
  const email = profile.email.toLowerCase()
  await prisma.user.updateMany({ where: { email, googleSub: null, isAgent: false }, data: { googleSub: profile.sub } })
  const user = await prisma.user.upsert({
    where: { googleSub: profile.sub },
    create: { googleSub: profile.sub, email, name: profile.name, avatarUrl: profile.avatarUrl },
    update: { email, name: profile.name, avatarUrl: profile.avatarUrl },
  })
  if (user.isAgent) throw new Error('Invalid Google user')
  return user
}
