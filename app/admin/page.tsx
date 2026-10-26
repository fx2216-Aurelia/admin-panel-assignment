import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export default async function AdminPage() {
    const supabase = await createClient()

    // 1. 验证用户及权限
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_superadmin')
        .eq('id', user.id)
        .single()

    if (!profile?.is_superadmin) {
        return <div className="p-8 text-red-500 text-center">Access Denied (403 Forbidden)</div>
    }

    // 2. Server Actions (CRUD)
    async function createGeneration(formData: FormData) {
        'use server'
        const prompt = formData.get('prompt') as string
        const supabase = await createClient()
        await supabase.from('generations').insert([{ prompt: prompt, upvotes: 0, downvotes: 0 }])
        revalidatePath('/admin')
    }

    async function updateGeneration(formData: FormData) {
        'use server'
        const id = formData.get('id')
        const prompt = formData.get('prompt') as string
        const supabase = await createClient()
        await supabase.from('generations').update({ prompt: prompt }).eq('id', id)
        revalidatePath('/admin')
    }

    async function deleteGeneration(formData: FormData) {
        'use server'
        const id = formData.get('id')
        const supabase = await createClient()
        await supabase.from('generations').delete().eq('id', id)
        revalidatePath('/admin')
    }

    // 3. 获取数据
    const { data: profiles } = await supabase.from('profiles').select('id, email, is_superadmin')
    const { data: generations } = await supabase.from('generations').select('*')

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <nav className="flex justify-between items-center mb-8 border-b pb-4">
                <h1 className="text-3xl font-bold">Admin Panel</h1>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">Welcome, Admin</span>
            </nav>

            {/* 用户管理表 */}
            <section className="mb-12">
                <h2 className="text-xl font-semibold mb-4">User Management</h2>
                <table className="w-full border-collapse border border-gray-300 text-sm">
                    <thead className="bg-gray-100">
                    <tr><th className="border p-2 text-left">Email</th><th className="border p-2 text-left">Role</th></tr>
                    </thead>
                    <tbody>
                    {profiles?.map((p: any) => (
                        <tr key={p.id}><td className="border p-2">{p.email}</td><td className="border p-2">{p.is_superadmin ? 'Admin' : 'User'}</td></tr>
                    ))}
                    </tbody>
                </table>
            </section>

            {/* AI Media 管理 (CREATE / READ / UPDATE / DELETE) */}
            <section>
                <h2 className="text-xl font-semibold mb-4">AI Media Management</h2>

                {/* CREATE 表单 */}
                <form action={createGeneration} className="mb-6 p-4 bg-gray-50 rounded border flex gap-2">
                    <input name="prompt" placeholder="New media prompt..." required className="flex-grow p-2 border rounded" />
                    <button className="bg-green-600 text-white px-4 py-2 rounded">Create New</button>
                </form>

                <div className="grid gap-4">
                    {generations?.map((gen: any) => (
                        <form key={gen.id} className="border p-4 rounded-lg shadow-sm flex items-center justify-between bg-white gap-4">
                            <input type="hidden" name="id" value={gen.id} />

                            {/* UPDATE 输入框 */}
                            <input name="prompt" defaultValue={gen.prompt} className="flex-grow p-2 border rounded" />

                            <div className="flex gap-2 text-sm">
                                <span className="text-green-600">👍{gen.upvotes || 0}</span>
                                <span className="text-red-600">👎{gen.downvotes || 0}</span>
                            </div>

                            <div className="flex gap-2">
                                <button formAction={updateGeneration} className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600">Update</button>
                                <button formAction={deleteGeneration} className="bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600">Delete</button>
                            </div>
                        </form>
                    ))}
                </div>
            </section>
        </div>
    )
}