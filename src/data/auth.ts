// Stand-in for Supabase anonymous sign-in until the backend step: a user id that stays in this
// browser, so a guest who typed only a name is recognised when they open the link again.
const KEY = 'fair-and-fun:user-id'
let fallbackId: string | undefined

export function currentUserId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // Storage blocked (private mode): this tab still gets a stable id.
    return (fallbackId ??= crypto.randomUUID())
  }
}
