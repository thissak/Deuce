import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import {
  ActivityItemSchema,
  ConversationDetailSchema,
  ConversationSummarySchema,
  MessagePageSchema,
  PresenceSnapshotSchema,
  SearchResultSchema,
  SharedFileSchema,
  UserDtoSchema,
  type UserDto,
} from '@deuce/shared'
import { z } from 'zod'
import { api, ApiError } from './http'

export const conversationsKey = ['conversations'] as const
export const messagesKey = (conversationId: string) => ['messages', conversationId] as const

export const meQuery = queryOptions({
  queryKey: ['me'] as const,
  queryFn: async (): Promise<UserDto | null> => {
    try {
      return UserDtoSchema.parse(await api('/auth/me'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null
      throw e
    }
  },
  staleTime: Infinity,
  retry: false,
})

export const usersQuery = queryOptions({
  queryKey: ['users'] as const,
  queryFn: async () => z.array(UserDtoSchema).parse(await api('/api/users')),
})

export const conversationsQuery = queryOptions({
  queryKey: conversationsKey,
  queryFn: async () => z.array(ConversationSummarySchema).parse(await api('/api/conversations')),
})

export const conversationDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ['conversation', id] as const,
    queryFn: async () => ConversationDetailSchema.parse(await api(`/api/conversations/${id}`)),
    retry: false, // 403(멤버 아님)을 즉시 드러낸다 — 이월: 403/404 비대칭 처리
  })

export const messagesQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: messagesKey(id),
    queryFn: async ({ pageParam }) =>
      MessagePageSchema.parse(
        await api(
          `/api/conversations/${id}/messages${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        ),
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

export const presenceQuery = queryOptions({
  queryKey: ['presence'] as const,
  queryFn: async () => PresenceSnapshotSchema.parse(await api('/api/presence')),
})

export const activityQuery = queryOptions({
  queryKey: ['activity'] as const,
  queryFn: async () => z.array(ActivityItemSchema).parse(await api('/api/activity')),
})

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ['search', q] as const,
    queryFn: async () => z.array(SearchResultSchema).parse(await api(`/api/search?q=${encodeURIComponent(q)}`)),
    enabled: q.trim().length >= 2,
  })

export const sharedFilesQuery = (id: string) =>
  queryOptions({
    queryKey: ['shared', id] as const,
    queryFn: async () => z.array(SharedFileSchema).parse(await api(`/api/conversations/${id}/attachments`)),
  })
