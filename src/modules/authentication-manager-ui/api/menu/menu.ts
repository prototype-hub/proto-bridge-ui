import { request } from '@/shared/api/client'
import type { ServerMenu } from '@/shared/auth/types'
import type { Query, RequestOptions } from '@/shared/api/types'
import {
  menuQuery,
  normalizeMenu,
  normalizeMenuTree,
} from '@/modules/authentication-manager-ui/utils/menu'

export const menuManagement = {
  list: async (query: Query = {}, options?: RequestOptions) =>
    normalizeMenuTree(
      (await request.post<unknown>('/menu/_all/tree', menuQuery(query), options)).result,
    ),
  detail: async (id: string) =>
    normalizeMenu((await request.get<unknown>(`/menu/${encodeURIComponent(id)}`)).result),
  validate: async (code: string) =>
    (
      await request.get<{ passed: boolean; reason?: string }>('/menu/code/_validate', {
        code,
      })
    ).result,
  save: async (input: ServerMenu, creating: boolean) =>
    (
      await (creating
        ? request.post<ServerMenu>('/menu', input)
        : request.patch<ServerMenu>('/menu', input))
    ).result,
  remove: (id: string) => request.remove(`/menu/${encodeURIComponent(id)}`),
}

/**
 * 获取当前用户可访问菜单
 * @param data
 * @returns
 */
export const getMenuTree = (data: unknown) => request.post(`/menu/_all/tree`, data)

/**
 * 获取当前用户可访问菜单 包含权限
 * @param data
 * @returns
 */
export const getOwnMenuThree = (data: unknown) => request.post<unknown>('/menu/user-own/tree', data)
/**
 * 校验编码唯一性
 * @param data
 */
export const validMenuCode = (data: unknown) => request.get(`/menu/code/_validate`, data)

/**
 * 获取资产类型
 * @returns
 */
export const getAssetsType = () => request.get(`/asset/types`)

/**
 * 获取菜单详情
 * @returns
 */
export const getMenuInfo = (id: string) => request.get(`/menu/${id}`)

/**
 * 编辑菜单信息
 * @returns
 */
export const updateMenu = (data: unknown) => request.patch(`/menu`, data)

/**
 * 新增菜单信息
 * @returns
 */
export const addMenu = (data: unknown) => request.post(`/menu`, data)

/**
 * 删除菜单信息
 * @returns
 */
export const delMenu = (id: string) => request.remove(`/menu/${id}`)

// 获取当前用户可访问菜单
export const getMenuTree_api = (data: object) => request.post(`/menu/_all/tree`, data)

/**
 * 校验编码唯一性
 * @param data
 */
export const validCode_api = (data: object) => request.get(`/menu/code/_validate`, data)

// 获取菜单详情
export const getMenuInfo_api = (id: string) => request.get(`/menu/${id}`)
// 编辑菜单信息
export const saveMenuInfo_api = (data: object) => request.patch(`/menu`, data)
// 新增菜单信息
export const addMenuInfo_api = (data: object) => request.post(`/menu`, data)
// 删除菜单信息
export const delMenuInfo_api = (id: string) => request.remove(`/menu/${id}`)
