/**
 * name : common.js
 * author : Priyanka Pradeep
 * created-date : 21-Mar-2024
 * Description : All common messages.
 */

module.exports = {
	ACTIVE_STATUS: 'ACTIVE',
	INTERNAL_ACCESS_URLS: [
		'/entityTypes/bulkCreate',
		'/entityTypes/bulkUpdate',
		'/entityTypes/find',
		'/entities/bulkCreate',
		'/entities/bulkUpdate',
		'/entities/add',
		'/entities/createUserAsAnEntity',
		'/entities/update',
		'/entityTypes/create',
		'/entityTypes/update',
		'/entities/find',
		'/userRoleExtension/find',
		'/userRoleExtension/create',
		'/userRoleExtension/update',
		'/entities/createMappingCsv',
		'/userRoleExtension/create',
		'/userRoleExtension/update',
		'/userRoleExtension/delete',
		'/admin/createIndex',
		'/admin/deleteEntity',
	],
	SYSTEM: 'SYSTEM',
	SUCCESS: 'SUCCESS',
	FAILURE: 'FAILURE',
	CACHE_TTL: '43200',
	PROFILE_CONFIG_FORM_KEY: 'profileConfig_v2',
	GET_METHOD: 'GET',
	ENTITYTYPE: 'entityType',
	GROUPS: 'groups',
	AUTH_METHOD: {
		NATIVE: 'native',
		KEYCLOAK_PUBLIC_KEY: 'keycloak_public_key',
	},
	ENGLISH_LANGUGE_CODE: 'en',
	ADMIN_ROLE: 'admin',
	ORG_ADMIN: 'org_admin',
	TENANT_ADMIN: 'tenant_admin',
	USER_ROLE: 'user',
	SERVER_TIME_OUT: 5000,
	GUEST_URLS: ['/entities/details', '/entities/entityListBasedOnEntityType', 'entities/subEntityList'],
	ALL: 'ALL',
	SUBROLE_ENTITY_TYPE: 'professional_subroles',
}
