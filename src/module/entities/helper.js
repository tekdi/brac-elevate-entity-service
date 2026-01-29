/**
 * name : helper.js
 * author : Priyanka Pradeep
 * created-date : 21-Mar-2024
 * Description : entities helper functionality.
 */

// Dependencies
const entityTypesHelper = require(MODULES_BASE_PATH + '/entityTypes/helper')
const entitiesQueries = require(DB_QUERY_BASE_PATH + '/entities')
const entityTypeQueries = require(DB_QUERY_BASE_PATH + '/entityTypes')
const userRoleExtensionHelper = require(MODULES_BASE_PATH + '/userRoleExtension/helper')
const { ObjectId } = require('mongodb')
const { Parser } = require('json2csv')

const _ = require('lodash')

/**
 * UserProjectsHelper
 * @class
 */

module.exports = class UserProjectsHelper {
	/**
	 * Mapping upload
	 * @method
	 * @name processEntityMappingUploadData
	 * @param {Array} [mappingData = []] - Array of entityMap data.
	 * @returns {JSON} - Success and message .
	 */
	static async processEntityMappingUploadData(mappingData = []) {
		try {
			// Initialize an array to store processed child entity IDs
			let entities = []

			// Initialize an object to keep track of mappings and updates
			if (mappingData.length < 1) {
				throw new Error(CONSTANTS.apiResponses.INVALID_MAPPING_DATA)
			}

			this.entityMapProcessData = {
				entityTypeMap: {},
				relatedEntities: {},
				entityToUpdate: {},
			}

			// Use batch processing to handle sub-entity addition
			let batchPromises = []
			mappingData.forEach(({ parentEntiyId, childEntityId }) => {
				if (parentEntiyId && childEntityId) {
					// Add a promise to the batch for processing sub-entity addition
					batchPromises.push(
						this.addSubEntityToParent(parentEntiyId, childEntityId).then(() => entities.push(childEntityId))
					)
				}
			})
			// Wait for all sub-entity addition promises to complete
			await Promise.all(batchPromises)

			// Batch update operation for entities
			if (Object.keys(this.entityMapProcessData.entityToUpdate).length > 0) {
				const updateOperations = Object.entries(this.entityMapProcessData.entityToUpdate).map(
					([entityIdToUpdate, groupUpdates]) => {
						let updateQuery = { $addToSet: {} }
						for (let groupToUpdate in groupUpdates) {
							updateQuery['$addToSet'][groupToUpdate] = {
								$each: groupUpdates[groupToUpdate],
							}
						}
						// Return a promise to update the entity in the database
						return entitiesQueries.updateMany({ _id: ObjectId(entityIdToUpdate) }, updateQuery)
					}
				)
				// Execute all update operations in parallel
				await Promise.all(updateOperations)
			}

			// Clear entityMapProcessData after processing
			this.entityMapProcessData = {}

			return {
				success: true,
				message: CONSTANTS.apiResponses.ENTITY_INFORMATION_UPDATE,
			}
		} catch (error) {
			throw error
		}
	}

	/**
	 * Processes entity data from CSV and generates mapping data in CSV format.
	 * Maps parent and child entity relationships based on the provided entity data.
	 * @method
	 * @name createMappingCsv
	 * @param {Array<Object>} entityCSVData - Array of objects parsed from the input CSV file.
	 * @param {String} tenantId - Tenant ID for the user.
	 * @returns {Promise<Object>} Resolves with an object containing:
	 */

	static async createMappingCsv(entityCSVData, tenantId) {
		return new Promise(async (resolve, reject) => {
			try {
				const parentEntityIds = []
				const childEntityIds = []
				const resultData = []

				// Iterate over each row of the input CSV data
				for (const entityData of entityCSVData) {
					const entityIds = []
					const rowStatus = {}

					// Iterate through each key-value pair in the row
					for (const [key, value] of Object.entries(entityData)) {
						// Filter criteria to fetch entity documents based on entity type and external ID
						const filter = {
							'metaInformation.externalId': value,
							tenantId: tenantId,
						}

						const entityDocuments = await entitiesQueries.entityDocuments(filter, ['_id'])

						if (entityDocuments.length > 0) {
							// Add entity IDs to the temporary array
							for (const doc of entityDocuments) {
								entityIds.push(doc._id)
							}
							// Add success status for the entity type
							rowStatus[`${key}Status`] = CONSTANTS.apiResponses.ENTITY_FETCHED
						} else {
							// Add failure status if no matching entity is found
							rowStatus[`${key}Status`] = CONSTANTS.apiResponses.ENTITY_NOT_FOUND
						}
					}

					// Separate parent and child entity IDs
					if (entityIds.length > 1) {
						parentEntityIds.push(...entityIds.slice(0, -1))
						childEntityIds.push(...entityIds.slice(1))
					} else if (entityIds.length === 1) {
						parentEntityIds.push(entityIds[0])
					}

					// Add the status columns to the processed row
					resultData.push({ ...entityData, ...rowStatus })
				}

				// Create the content for the mapping CSV (parent-child relationships)
				let mappingCSVContent = 'parentEntiyId,childEntityId\n'
				const maxLength = Math.max(parentEntityIds.length, childEntityIds.length)

				// Add parent-child mappings to the CSV content
				for (let item = 0; item < maxLength; item++) {
					const parentId = parentEntityIds[item] || ''
					const childId = childEntityIds[item] || ''
					mappingCSVContent += `${parentId},${childId}\n`
				}

				// Convert the processed result data to CSV format
				const json2csvParser = new Parser()
				const resultCSVContent = json2csvParser.parse(resultData)

				// Convert CSV content to Base64
				const mappingCSV = Buffer.from(mappingCSVContent).toString('base64')
				const resultCSV = Buffer.from(resultCSVContent).toString('base64')

				resolve({
					mappingCSV,
					resultCSV,
					parentEntityIds,
					childEntityIds,
				})
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * List of Entities
	 * @method
	 * @name listByEntityIds
	 * @param {Array} entityIds
	 * @param {Array} fields
	 * @param {Object} userDetails - user's loggedin info
	 * @returns {Array} List of Entities.
	 */

	static listByEntityIds(entityIds = [], fields = [], userDetails) {
		return new Promise(async (resolve, reject) => {
			try {
				// Call 'entitiesQueries.entityDocuments' to retrieve entities based on provided entity IDs and fields
				let tenantId = userDetails.userInformation.tenantId

				const entities = await entitiesQueries.entityDocuments(
					{
						_id: { $in: entityIds },
						tenantId: tenantId,
					},
					fields ? fields : []
				)

				return resolve({
					message: CONSTANTS.apiResponses.ENTITIES_FETCHED,
					result: entities,
				})
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Get immediate entities for requested Array.
	 * @method
	 * @name subEntityList
	 * @param {params} entities - array of entitity ids
	 * @param {params} entityId - single entitiy id
	 * @param {params} type - sub list entity type.
	 * @param {params} search - search entity data.
	 * @param {params} limit - page limit.
	 * @param {params} pageNo - page no.
	 * @param {params} language - language Code
	 * @param {Object} userDetails - loggedin user's details
	 * @param {Boolean} parentInfoRequired - additional fields to be fetched if true
	 * @returns {Array} - List of all sub list entities.
	 */

	static subEntityList(
		entities,
		entityId,
		type,
		search,
		limit,
		pageNo,
		language,
		userDetails,
		parentInfoRequired = false,
		sortOrder = '',
		sortKey = ''
	) {
		return new Promise(async (resolve, reject) => {
			try {
				let tenantId = userDetails.userInformation.tenantId
				let result = []
				let obj = {
					entityId: entityId,
					type: type,
					search: search,
					limit: limit,
					pageNo: pageNo,
				}
				// Retrieve sub-entities using 'this.subEntities' for a single entity
				if (entityId !== '') {
					result = await this.subEntities(obj, language, tenantId, sortOrder, sortKey)
				} else {
					// Retrieve sub-entities using 'this.subEntities' for multiple entities
					await Promise.all(
						entities.map(async (entity) => {
							obj['entityId'] = entity
							let entitiesDocument = await this.subEntities(obj, language, tenantId, sortOrder, sortKey)

							if (Array.isArray(entitiesDocument.data) && entitiesDocument.data.length > 0) {
								result = entitiesDocument
							}
						})
					)
				}

				// Modify data properties (e.g., 'label') of retrieved entities if necessary
				if (parentInfoRequired && result.data && result.data.length > 0) {
					// fetch the entity ids to look for parent hierarchy
					const entityIds = result.data.map((item) => ObjectId(item._id))
					// dynamically set the entityType to search inside the group
					const key = ['groups', type]

					// create filter for fetching the parent data using group
					const entityFilter = {
						[key.join('.')]: { $in: entityIds },
						tenantId,
					}

					let entityDocuments = await entitiesQueries.getAggregate([
						{
							$match: entityFilter,
						},
						{
							$project: {
								entityType: 1,
								'metaInformation.name': 1,
								childHierarchyPath: 1,
								[key.join('.')]: 1,
								childHierarchyPathSize: { $size: '$childHierarchyPath' },
							},
						},
						{
							$addFields: {
								childHierarchyPathSize: {
									$cond: {
										if: { $isArray: '$childHierarchyPath' },
										then: { $size: '$childHierarchyPath' },
										else: 0,
									},
								},
							},
						},
						{
							$sort: {
								childHierarchyPathSize: -1, // Sort by size in descending order
							},
						},
					])

					if (entityDocuments?.length > 0) {
						// Get the first entity (will have the largest childHierarchyPath due to sort)
						const topEntity = entityDocuments[0]
						const topEntityHierarchy = Array.isArray(topEntity?.childHierarchyPath)
							? topEntity.childHierarchyPath
							: []

						if (topEntityHierarchy?.length > 0 && type) {
							const hierarchyLevels = topEntityHierarchy.slice(
								0,
								topEntityHierarchy.indexOf(type) !== -1
									? topEntityHierarchy.indexOf(type) + 1
									: topEntityHierarchy.length
							)

							// Create an efficient lookup map for entities
							const groupEntityMap = entityDocuments.reduce((map, entity) => {
								const group = entity?.groups?.[type]
								if (Array.isArray(group)) {
									group.forEach((childId) => {
										const idStr = childId.toString()
										if (!map.has(idStr)) {
											map.set(idStr, [])
										}
										map.get(idStr).push(entity)
									})
								}
								return map
							}, new Map())

							// Process the results more efficiently
							result.data = result.data.map((entity) => ({
								...entity,
								label: entity.name,
								value: entity._id,
								...hierarchyLevels.reduce((entityTypeNameMap, entityType) => {
									const relatedEntities = groupEntityMap.get(entity._id.toString()) || []
									const matchingEntity = relatedEntities.find(
										(relatedEntity) => relatedEntity.entityType === entityType
									)
									if (matchingEntity) {
										entityTypeNameMap[entityType] = matchingEntity?.metaInformation?.name
									}
									return entityTypeNameMap
								}, {}),
							}))
						}
					}
				}

				resolve({
					message: CONSTANTS.apiResponses.ENTITIES_FETCHED,
					result: result,
				})
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Fetches targeted roles based on the provided entity IDs.
	 * @param {Array<string>} entityId - An array of entity IDs to filter roles.
	 * @name targetedRoles
	 * @param {params} pageSize - page pageSize.
	 * @param {params} pageNo - page no.
	 * @param {String} type - Entity type
	 * @param {String} roleLevel - Role level to filter roles (e.g., 'professional_subroles').
	 * @param {String} tenantId - user's tenantId
	 * @returns {Promise<Object>} A promise that resolves to the response containing the fetched roles or an error object.
	 */
	static targetedRoles(
		entityId,
		pageNo = '',
		pageSize = '',
		paginate,
		type = '',
		roleLevel = '',
		language,
		tenantId
	) {
		return new Promise(async (resolve, reject) => {
			try {
				// Construct the filter to retrieve entities based on provided entity IDs
				const filter = {
					_id: {
						$in: entityId,
					},
					tenantId: tenantId,
				}
				const projectionFields = ['childHierarchyPath', 'entityType']
				// Retrieve entityDetails based on provided entity IDs
				const entityDetails = await entitiesQueries.entityDocuments(filter, projectionFields)

				if (
					!entityDetails ||
					!entityDetails[0]?.childHierarchyPath ||
					entityDetails[0]?.childHierarchyPath.length < 0
				) {
					throw {
						status: HTTP_STATUS_CODE.not_found.status,
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					}
				}
				// Extract the childHierarchyPath and entityType
				const { childHierarchyPath, entityType } = entityDetails[0]

				// Append entityType to childHierarchyPath array
				const updatedChildHierarchyPaths = [entityType, ...childHierarchyPath]

				// Filter for higher entity types if a specific type is requested
				let filteredHierarchyPaths = updatedChildHierarchyPaths
				if (type) {
					const typeIndex = updatedChildHierarchyPaths.indexOf(type)
					if (typeIndex > -1) {
						// Include only higher types in the hierarchy
						filteredHierarchyPaths = updatedChildHierarchyPaths.slice(0, typeIndex + 1)
					}
				}

				// Construct the filter
				const roleFilter = {
					entityType: roleLevel ? roleLevel : CONSTANTS.common.SUBROLE_ENTITY_TYPE,
					tenantId: tenantId,
					deleted: false,
					'metaInformation.targetedEntityTypes.entityType': { $in: filteredHierarchyPaths },
				}

				const roleProjection = ['_id', 'metaInformation.name', 'metaInformation.externalId']

				// Fetch the user roles based on the filter and projection
				const fetchRoles = await entitiesQueries.entityDocuments(
					roleFilter,
					roleProjection,
					pageSize,
					pageSize * (pageNo - 1),
					'',
					paginate
				)

				// Check if the fetchUserRoles operation was successful and returned data
				if (!fetchRoles || fetchRoles.length === 0) {
					throw {
						status: HTTP_STATUS_CODE.not_found.status,
						message: CONSTANTS.apiResponses.ROLES_NOT_FOUND,
					}
				}

				// Transforming the data
				const transformedData = fetchRoles.map((item) => ({
					_id: item._id,
					value: item.metaInformation?.externalId,
					label: item.metaInformation?.name,
					code: item.metaInformation?.externalId,
				}))

				return resolve({
					message: CONSTANTS.apiResponses.ROLES_FETCHED_SUCCESSFULLY,
					result: transformedData || [],
					count: fetchRoles.length || 0,
				})
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Get either immediate entities or entity traversal based upon the type.
	 * @method
	 * @name subEntities
	 * @param {body} entitiesData
	 * @param {String} tenantId
	 * @param {String} sortOrder
	 * @param {String} sortKey
	 * @returns {Array} - List of all immediate entities or traversal data.
	 */

	static subEntities(entitiesData, language, tenantId, sortOrder = '', sortKey = '') {
		return new Promise(async (resolve, reject) => {
			try {
				let entitiesDocument

				if (entitiesData.type !== '') {
					// Perform entity traversal based on the specified type
					entitiesDocument = await this.entityTraversal(
						entitiesData.entityId,
						entitiesData.type,
						entitiesData.search,
						entitiesData.limit,
						entitiesData.pageNo,
						language,
						tenantId,
						sortOrder,
						sortKey
					)
				} else {
					// Retrieve immediate entities
					entitiesDocument = await this.immediateEntities(
						entitiesData.entityId,
						entitiesData.search,
						entitiesData.limit,
						entitiesData.pageNo,
						language,
						tenantId
					)
				}

				return resolve(entitiesDocument)
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Get immediate entities.
	 * @method
	 * @name immediateEntities
	 * @param {Object} entityId
	 * @param {String} searchText
	 * @param {String} pageSize
	 * @param {String} pageNo
	 * @param {String} tenantId - user's tenant id
	 * @returns {Array} - List of all immediateEntities based on entityId.
	 */

	static immediateEntities(entityId, searchText = '', pageSize = '', pageNo = '', tenantId) {
		return new Promise(async (resolve, reject) => {
			try {
				// Define projection fields for entity retrieval
				let projection = [CONSTANTS.common.ENTITYTYPE, CONSTANTS.common.GROUPS]
				// Retrieve entity documents based on entityId and projection fields
				let entitiesDocument = await entitiesQueries.entityDocuments(
					{
						_id: entityId,
						tenantId: tenantId,
					},
					projection
				)
				let immediateEntities = []
				// Process entity groups and retrieve immediate entity types
				if (
					entitiesDocument[0] &&
					entitiesDocument[0].groups &&
					Object.keys(entitiesDocument[0].groups).length > 0
				) {
					let getImmediateEntityTypes = await entityTypesHelper.entityTypesDocument(
						{
							name: entitiesDocument[0].entityType,
							tenantId: tenantId,
						},
						['immediateChildrenEntityType']
					)

					let immediateEntitiesIds
					// Identify immediate entity types and fetch associated entity IDs
					Object.keys(entitiesDocument[0].groups).forEach((entityGroup) => {
						if (
							getImmediateEntityTypes[0].immediateChildrenEntityType &&
							getImmediateEntityTypes[0].immediateChildrenEntityType.length > 0 &&
							getImmediateEntityTypes[0].immediateChildrenEntityType.includes(entityGroup)
						) {
							immediateEntitiesIds = entitiesDocument[0].groups[entityGroup]
						}
					})

					if (Array.isArray(immediateEntitiesIds) && immediateEntitiesIds.length > 0) {
						let searchImmediateData = await this.search(
							searchText,
							pageSize,
							pageNo,
							immediateEntitiesIds,
							language,
							tenantId,
							sortOrder,
							sortKey
						)

						immediateEntities = searchImmediateData[0]
					}
				}

				return resolve(immediateEntities)
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Get immediate entities.
	 * @method
	 * @name entityTraversal
	 * @param {Object} entityId
	 * @param {String} language - language Code.
	 * @param {Number} pageSize - total page size.
	 * @param {Number} pageNo - Page no.
	 * @param {String} searchText - Search Text.
	 * @param {String} tenantId - user's tenant id
	 * @param {String} sortOrder - Sort order key for sorting
	 * @param {String} sortKey - sort key for sorting
	 * @returns {Array} - List of all immediateEntities based on entityId.
	 */

	static entityTraversal(
		entityId,
		entityTraversalType = '',
		searchText = '',
		pageSize,
		pageNo,
		language,
		tenantId,
		sortOrder = '',
		sortKey = ''
	) {
		return new Promise(async (resolve, reject) => {
			try {
				let entityTraversal = `groups.${entityTraversalType}`
				// Retrieve entity documents for entity traversal based on entityId, entity traversal type, search text, page size, and page number
				let entitiesDocument = await entitiesQueries.entityDocuments(
					{
						_id: entityId,
						groups: { $exists: true },
						[entityTraversal]: { $exists: true },
						tenantId: tenantId,
					},
					[entityTraversal]
				)
				// Return an empty array if no entities document is found
				if (!entitiesDocument[0]) {
					return resolve([])
				}
				let result = []
				// Process entity traversal data and retrieve entities based on search parameters
				if (entitiesDocument[0].groups[entityTraversalType].length > 0) {
					let entityTraversalData = await this.search(
						searchText,
						pageSize,
						pageNo,
						entitiesDocument[0].groups[entityTraversalType],
						language,
						tenantId,
						sortOrder,
						sortKey
					)

					result = entityTraversalData[0]
				}
				return resolve(result)
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Search entity.
	 * @method
	 * @name search
	 * @param {String} searchText - Text to be search.
	 * @param {String} language - language Code.
	 * @param {Number} pageSize - total page size.
	 * @param {Number} pageNo - Page no.
	 * @param {String} tenantId - user's tenantId
	 * @param {String} sortOrder - Sort order key for sorting
	 * @param {String} sortKey - Sort key for sorting
	 * @param {Array} [entityIds = false] - Array of entity ids.
	 */

	static search(searchText, pageSize, pageNo, entityIds = false, language, tenantId, sortOrder = '', sortKey = '') {
		return new Promise(async (resolve, reject) => {
			try {
				let queryObject = {}
				// Configure match criteria based on search text and entity IDs (if provided)
				queryObject['$match'] = {
					tenantId: tenantId,
				}

				if (entityIds && entityIds.length > 0) {
					queryObject['$match']['_id'] = {}
					queryObject['$match']['_id']['$in'] = entityIds
				}

				if (searchText !== '') {
					queryObject['$match']['$or'] = [
						{ 'metaInformation.name': new RegExp(searchText, 'i') },
						{ 'metaInformation.externalId': new RegExp('^' + searchText, 'm') },
						{ 'metaInformation.addressLine1': new RegExp(searchText, 'i') },
						{ 'metaInformation.addressLine2': new RegExp(searchText, 'i') },
					]
				}

				let finalEntityDocuments = []
				// check the language criteria is set to english or not
				const isEnglish = !language || language === CONSTANTS.common.ENGLISH_LANGUGE_CODE
				// construct the name expression based on language
				const nameExpr = isEnglish ? '$metaInformation.name' : `$translations.${language}.name`
				// create a query pipeline
				let pipeline = [
					queryObject,
					{
						$project: {
							name: nameExpr,
							externalId: '$metaInformation.externalId',
							addressLine1: '$metaInformation.addressLine1',
							addressLine2: '$metaInformation.addressLine2',
							entityType: 1,
						},
					},
				]
				// check if sort is necessary
				// added here because $sort is not allowed after $facet
				if (sortOrder && sortKey) {
					// Define sort order
					sortOrder = sortOrder.toLowerCase() === 'desc' ? -1 : 1

					// Create sort object dynamically
					pipeline.push({ $sort: { [sortKey]: sortOrder } })
				}
				// append the remaining to pipeline
				pipeline = [
					...pipeline,
					...[
						{
							$facet: {
								totalCount: [{ $count: 'count' }],
								data: [{ $skip: pageSize * (pageNo - 1) }, { $limit: pageSize }],
							},
						},
						{
							$project: {
								data: 1,
								count: { $arrayElemAt: ['$totalCount.count', 0] },
							},
						},
					],
				]
				const entityDocuments = await entitiesQueries.getAggregate(pipeline)
				finalEntityDocuments.push(...entityDocuments)

				return resolve(finalEntityDocuments)
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Add child entity inside parent entity groups.
	 * @method
	 * @name addSubEntityToParent
	 * @param {String} parentEntityId - parent entity id.
	 * @param {String} childEntityId - child entity id.
	 * @returns {JSON} - Success and message .
	 */

	static async addSubEntityToParent(parentEntityId, childEntityId) {
		try {
			// Find the child entity based on its ID
			const childEntity = await entitiesQueries.findOne(
				{ _id: ObjectId(childEntityId) },
				{ entityType: 1, groups: 1, childHierarchyPath: 1 }
			)

			// If the child entity does not exist, throw an error
			if (!childEntity) {
				throw {
					status: HTTP_STATUS_CODE.not_found.status,
					message: CONSTANTS.apiResponses.DOCUMENT_NOT_FOUND,
				}
			}

			// Proceed if the child entity has an entity type
			if (childEntity.entityType) {
				let parentEntityQueryObject = { _id: ObjectId(parentEntityId) }

				// Build the update query to add the child entity to the parent entity's groups
				let updateQuery = {
					$addToSet: {
						[`groups.${childEntity.entityType}`]: childEntity._id,
					},
				}

				// Add any existing child entity groups to the update query
				if (childEntity.groups) {
					for (const eachChildEntity in childEntity.groups) {
						if (childEntity.groups[eachChildEntity]?.length > 0) {
							updateQuery['$addToSet'][`groups.${eachChildEntity}`] = {
								$each: childEntity.groups[eachChildEntity],
							}
						}
					}
				}

				// Update childHierarchyPath in parent entity
				const childHierarchyPathToUpdate = [childEntity.entityType, ...(childEntity.childHierarchyPath || [])]

				updateQuery['$addToSet']['childHierarchyPath'] = { $each: childHierarchyPathToUpdate }

				// Optimize by fetching only required fields
				const projectedData = {
					_id: 1,
					entityType: 1,
					entityTypeId: 1,
					childHierarchyPath: 1,
				}

				// Perform update and fetch updated parent entity
				const updatedParentEntity = await entitiesQueries.findOneAndUpdate(
					parentEntityQueryObject,
					updateQuery,
					{ projection: projectedData, new: true }
				)

				// Process mapped parent entities in parallel
				await this.mappedParentEntities(updatedParentEntity, childEntity)
			}

			return
		} catch (error) {
			throw {
				status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
				message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
			}
		}
	}

	/**
	 * Map parent entities
	 * @method
	 * @name mappedParentEntities
	 * @param {Object} parentEntity
	 * @param {String} parentEntity.entityType - entity type of the parent.
	 * @param {String} parentEntity._id - parentEntity id.
	 * @param {Object} childEntity
	 * @param {String} childEntity.entityType - entity type of the child.
	 * @param {String} childEntity._id - childEntity id.
	 */
	static async mappedParentEntities(parentEntity, childEntity) {
		try {
			let updateParentHierarchy = false
			// Check if entityMapProcessData and entityTypeMap are defined
			if (this.entityMapProcessData?.entityTypeMap?.[parentEntity.entityType]) {
				updateParentHierarchy =
					this.entityMapProcessData.entityTypeMap[parentEntity.entityType].updateParentHierarchy
			} else {
				// Fetch update status from database if not in cache
				const checkParentEntitiesMappedValue = await entityTypeQueries.findOne(
					{ name: parentEntity.entityType },
					{ toBeMappedToParentEntities: 1 }
				)

				// Throw an error if no result is found
				if (!checkParentEntitiesMappedValue) {
					throw {
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.DOCUMENT_NOT_FOUND,
					}
				}

				// Determine whether to update parent hierarchy
				updateParentHierarchy = !!checkParentEntitiesMappedValue.toBeMappedToParentEntities

				// Cache the result in entityMapProcessData if available
				if (this.entityMapProcessData?.entityTypeMap) {
					this.entityMapProcessData.entityTypeMap[parentEntity.entityType] = {
						updateParentHierarchy,
					}
				}
			}

			// If updateParentHierarchy is true, process related entities
			if (updateParentHierarchy) {
				const relatedEntities = await this.relatedEntities(
					parentEntity._id,
					parentEntity.entityTypeId,
					parentEntity.entityType,
					['_id']
				)

				// Prepare the child hierarchy path to update
				let childHierarchyPathToUpdate = [parentEntity.entityType, ...(parentEntity.childHierarchyPath || [])]

				// If there are related entities, update them
				if (relatedEntities.length > 0) {
					// Check if entityToUpdate cache is available
					if (this.entityMapProcessData?.entityToUpdate) {
						relatedEntities.forEach((relatedEntity) => {
							const relatedEntityId = relatedEntity._id.toString()

							// Initialize entityToUpdate for the related entity if not already present
							if (!this.entityMapProcessData.entityToUpdate[relatedEntityId]) {
								this.entityMapProcessData.entityToUpdate[relatedEntityId] = {}
							}

							// Prepare the group update path
							const groupUpdatePath = `groups.${childEntity.entityType}`
							// Initialize the group update path array if not already present
							if (!this.entityMapProcessData.entityToUpdate[relatedEntityId][groupUpdatePath]) {
								this.entityMapProcessData.entityToUpdate[relatedEntityId][groupUpdatePath] = []
							}

							// Add the child entity to the update path
							this.entityMapProcessData.entityToUpdate[relatedEntityId][groupUpdatePath].push(
								childEntity._id
							)
							// Update the child hierarchy path for the related entity
							this.entityMapProcessData.entityToUpdate[relatedEntityId]['childHierarchyPath'] =
								childHierarchyPathToUpdate
						})
					} else {
						// Prepare the update query for related entities
						const updateQuery = {
							$addToSet: {
								[`groups.${childEntity.entityType}`]: childEntity._id,
								childHierarchyPath: { $each: childHierarchyPathToUpdate },
							},
						}

						// Extract all related entity IDs
						const allEntityIds = relatedEntities.map((entity) => entity._id)
						// Perform the update operation for all related entities
						await entitiesQueries.updateMany({ _id: { $in: allEntityIds } }, updateQuery)
					}
				}
			}

			return
		} catch (error) {
			throw {
				status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
				message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
			}
		}
	}

	/**
	 * All the related entities for the given entities.
	 * @method
	 * @name relatedEntities
	 * @param {String} entityId - entity id.
	 * @param {String} entityTypeId - entity type id.
	 * @param {String} entityType - entity type.
	 * @param {Array} [projection = "all"] - total fields to be projected.
	 * @param {String} tenantId - user's tenant id
	 * @returns {Array} - returns an array of related entities data.
	 */

	static relatedEntities(entityId, entityTypeId, entityType, projection = 'all', tenantId) {
		return new Promise(async (resolve, reject) => {
			try {
				// if (
				// 	this.entityMapProcessData &&
				// 	this.entityMapProcessData.relatedEntities &&
				// 	this.entityMapProcessData.relatedEntities[entityId.toString()]
				// ) {

				// 	return resolve(this.entityMapProcessData.relatedEntities[entityId.toString()])
				// }

				let relatedEntitiesQuery = {
					tenantId,
				}

				if (entityTypeId && entityId && entityType) {
					relatedEntitiesQuery[`groups.${entityType}`] = entityId
					relatedEntitiesQuery['entityTypeId'] = {}
					relatedEntitiesQuery['entityTypeId']['$ne'] = entityTypeId
				} else {
					throw {
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.MISSING_ENTITYID,
					}
				}
				// Retrieve related entities matching the query criteria
				let relatedEntitiesDocument = await entitiesQueries.entityDocuments(relatedEntitiesQuery, projection)
				relatedEntitiesDocument = relatedEntitiesDocument ? relatedEntitiesDocument : []
				// if (this.entityMapProcessData && this.entityMapProcessData.relatedEntities) {
				// 	this.entityMapProcessData.relatedEntities[entityId.toString()] = relatedEntitiesDocument
				// }

				return resolve(relatedEntitiesDocument)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
				})
			}
		})
	}

	/**
	 * Sub entity type list.
	 * @method
	 * @name subEntityListBasedOnRoleAndLocation
	 * @param userDetails - loggedin user's details
	 * @param stateLocationId - state location id.
	 * @returns {Array} List of sub entity type.
	 */

	static subEntityListBasedOnRoleAndLocation(stateLocationId, userDetails) {
		return new Promise(async (resolve, reject) => {
			try {
				// let rolesDocument = await userRolesHelper.roleDocuments({
				//     code : role
				// },["entityTypes.entityType"]);

				// if( !rolesDocument.length > 0 ) {
				//     throw {
				//         status : httpStatusCode["bad_request"].status,
				//         message: CONSTANTS.apiResponses.USER_ROLES_NOT_FOUND
				//     }
				// }
				let tenantId = userDetails.userInformation.tenantId

				let filterQuery = {
					'registryDetails.code': stateLocationId,
					tenantId: tenantId,
				}

				// Check if stateLocationId is a valid UUID and update the filterQuery accordingly
				if (UTILS.checkValidUUID(stateLocationId)) {
					filterQuery = {
						'registryDetails.locationId': stateLocationId,
					}
				}

				// Retrieve entity documents based on the filterQuery
				const entityDocuments = await entitiesQueries.entityDocuments(filterQuery, [
					'childHierarchyPath',
					'entityType',
					'metaInformation',
				])

				if (!entityDocuments.length > 0) {
					throw {
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
						result: [],
					}
				}

				// let result = [];

				//  if( rolesDocument[0].entityTypes[0].entityType === constants.common.STATE_ENTITY_TYPE ) {
				//     result = entityDocuments[0].childHierarchyPath;
				//     result.unshift(constants.common.STATE_ENTITY_TYPE);
				//  } else {

				//     let targetedEntityType = "";

				//     rolesDocument[0].entityTypes.forEach(singleEntityType => {
				//        if( entityDocuments[0].childHierarchyPath.includes(singleEntityType.entityType) ) {
				//            targetedEntityType = singleEntityType.entityType;
				//        }
				//     });

				// let findTargetedEntityIndex =
				// entityDocuments[0].childHierarchyPath.findIndex(element => element === targetedEntityType);

				// if( findTargetedEntityIndex < 0 ) {
				//    throw {
				//        message : CONSTANTS.apiResponses.SUB_ENTITY_NOT_FOUND,
				//        result : []
				//    }
				// }

				// result = entityDocuments[0].childHierarchyPath.slice(findTargetedEntityIndex);

				return resolve({
					success: true,
					message: CONSTANTS.apiResponses.ENTITIES_CHILD_HIERACHY_PATH,
					result: entityDocuments,
				})
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * update registry in entities.
	 * @method
	 * @name listByLocationIds
	 * @param {Object} locationIds - locationIds
	 * @param {Object} userDetails - loggedin user's details
	 * @returns {Object} entity Document
	 */

	static listByLocationIds(locationIds, userDetails) {
		return new Promise(async (resolve, reject) => {
			try {
				let tenantId = userDetails.userInformation.tenantId

				// Constructing the filter query to find entities based on locationIds
				let filterQuery = {
					$or: [
						{
							'registryDetails.code': { $in: locationIds },
						},
						{
							'registryDetails.locationId': { $in: locationIds },
						},
					],
					tenantId: tenantId,
				}

				// Retrieving entities that match the filter query
				let entities = await entitiesQueries.entityDocuments(filterQuery, [
					'metaInformation',
					'entityType',
					'entityTypeId',
					'registryDetails',
				])
				if (!entities.length > 0) {
					throw {
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					}
				}

				return resolve({
					success: true,
					message: CONSTANTS.apiResponses.ENTITY_FETCHED,
					data: entities,
				})
			} catch (error) {
				return resolve({
					success: false,
					status: 400,
					message: error.message,
				})
			}
		})
	}

	/**
	 * find detils in entities.
	 * @method
	 * @name find
	 * @param {Object} bodyQuery - body data
	 * @param {Object} projection - projection to filter data
	 * @param {Number} pageNo - page number
	 * @param {Number} pageSize - page limit
	 * @param {String} searchText - Text string used for filtering entities using a search.
	 * @param {String} aggregateValue - Path to the field to aggregate (e.g., 'groups.school') used for grouping or lookups.
	 * @param {Boolean} aggregateStaging - Flag indicating whether aggregation stages should be used in the pipeline (true = include stages).
	 * @param {Boolean} aggregateSort - Flag indicating whether sorting is required within the aggregation pipeline.
	 * @param {Array} aggregateProjection - Array of projection fields to apply within the aggregation pipeline (used when `aggregateStaging` is true).
	 * @returns {Array} Entity Documents
	 */

	static find(
		bodyQuery,
		projection,
		pageNo,
		pageSize,
		searchText,
		aggregateValue,
		aggregateStaging,
		aggregateSort,
		aggregateProjection = []
	) {
		return new Promise(async (resolve, reject) => {
			try {
				let aggregateData, count
				bodyQuery = UTILS.convertMongoIds(bodyQuery)

				if (aggregateStaging == true) {
					let skip = (pageNo - 1) * pageSize
					let projection1 = {}
					if (aggregateProjection.length > 0) {
						aggregateProjection.forEach((value) => {
							projection1[value] = 1
						})
					}
					aggregateData = [
						{
							$match: bodyQuery,
						},
						{
							$project: {
								groupIds: aggregateValue,
							},
						},
						// Unwind the array so we don't hold all in memory
						{
							$unwind: '$groupIds',
						},
						// Replace the root so we can lookup directly
						{
							$replaceRoot: { newRoot: { _id: '$groupIds' } },
						},
						// Lookup actual school entity details
						{
							$lookup: {
								from: 'entities',
								localField: '_id',
								foreignField: '_id',
								as: 'groupEntityData',
							},
						},
						{
							$unwind: '$groupEntityData',
						},
						...(searchText
							? [
									{
										$match: {
											'groupEntityData.metaInformation.name': {
												$regex: searchText,
												$options: 'i', // case-insensitive search
											},
										},
									},
							  ]
							: []),
						{
							$skip: skip,
						},
						{
							$limit: pageSize,
						},
						{
							$replaceRoot: { newRoot: '$groupEntityData' },
						},
						...(aggregateProjection.length > 0 ? [{ $project: projection1 }] : []),
					]
				} else {
					// Create facet object to attain pagination
					let facetQuery = {}
					facetQuery['$facet'] = {}
					facetQuery['$facet']['totalCount'] = [{ $count: 'count' }]
					if (pageSize === '' && pageNo === '') {
						facetQuery['$facet']['data'] = [{ $skip: 0 }]
					} else {
						facetQuery['$facet']['data'] = [{ $skip: pageSize * (pageNo - 1) }, { $limit: pageSize }]
					}

					// add search filter to the bodyQuery
					if (searchText != '') {
						let searchData = [
							{
								'metaInformation.name': new RegExp(searchText, 'i'),
							},
						]
						bodyQuery['$and'] = searchData
					}

					// Create projection object
					let projection1
					if (Array.isArray(projection) && projection.length > 0) {
						projection1 = {}
						projection.forEach((projectedData) => {
							projection1[projectedData] = 1
						})
						aggregateData = [{ $match: bodyQuery }, { $project: projection1 }, facetQuery]
					} else {
						aggregateData = [{ $match: bodyQuery }, facetQuery]
					}
				}

				if (aggregateSort == true) {
					aggregateData.push({ $sort: { updateAt: -1 } })
				}

				let result = await entitiesQueries.getAggregate(aggregateData)
				count = result?.[0]?.totalCount?.[0]?.count || 0

				if (aggregateStaging == true) {
					if (!Array.isArray(result) || !(result.length > 0)) {
						throw {
							status: HTTP_STATUS_CODE.not_found.status,
							message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
						}
					}
				} else {
					if (!(result.length > 0) || !result[0].data || !(result[0].data.length > 0)) {
						throw {
							status: HTTP_STATUS_CODE.not_found.status,
							message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
						}
					}
					result = result[0].data
				}
				return resolve({
					success: true,
					message: CONSTANTS.apiResponses.ASSETS_FETCHED_SUCCESSFULLY,
					result: result,
					...(count !== undefined && { count }),
				})
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Fetches entity documents based on entity type.
	 * @method
	 * @name entityListBasedOnEntityType
	 * @param {string} type - Type of entity to fetch documents for.
	 * @param {string} pageNo - pageNo for pagination
	 * @param {string} language - language Code
	 * @param {string} pageSize - pageSize for pagination
	 * @param {Object} userDetails - user decoded token details
	 * @returns {Promise<Object>} Promise that resolves with fetched documents or rejects with an error.
	 */

	static entityListBasedOnEntityType(type, pageNo, pageSize, paginate, language, userDetails) {
		return new Promise(async (resolve, reject) => {
			try {
				let query = {}
				query['tenantId'] = userDetails.userInformation.tenantId
				query['name'] = type
				// Fetch the list of entity types available
				const entityList = await entityTypeQueries.entityTypesDocument(query, ['name'])
				// Check if entity list is empty
				if (!entityList.length > 0) {
					throw {
						status: HTTP_STATUS_CODE.not_found.status,
						message: CONSTANTS.apiResponses.ENTITYTYPE_NOT_FOUND,
					}
				}
				const projection = ['_id', 'metaInformation.name', 'metaInformation.externalId', 'translations']
				delete query.name
				query['entityType'] = type
				// Fetch documents for the matching entity type
				let fetchList = await entitiesQueries.entityDocuments(
					query,
					projection,
					pageSize,
					pageSize * (pageNo - 1),
					'',
					paginate
				)

				// Check if fetchList list is empty
				if (!(fetchList.length > 0)) {
					throw {
						status: HTTP_STATUS_CODE.not_found.status,
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					}
				}

				let result = []

				if (!language || language == CONSTANTS.common.ENGLISH_LANGUGE_CODE) {
					// No language specified – return metaInformation.name
					const listResult = fetchList.map((entity) => ({
						_id: entity._id,
						name: entity.metaInformation.name,
						externalId: entity.metaInformation.externalId,
					}))

					result.push(...listResult)
				} else {
					// Language specified – check and return translated name if available
					const listResult = fetchList
						.filter((entity) => entity.translations?.[language]?.name)
						.map((entity) => ({
							_id: entity._id,
							name: entity.translations[language].name,
							externalId: entity.metaInformation.externalId,
						}))

					result.push(...listResult)
				}
				// Transform the fetched list to match the required result format

				return resolve({
					success: true,
					message: CONSTANTS.apiResponses.ASSETS_FETCHED_SUCCESSFULLY,
					result,
					count: result.length,
				})
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Add entities.
	 * @method
	 * @name add
	 * @param {Object} queryParams - requested query data.
	 * @param {Object} data - requested entity data.
	 * @param {Object} userDetails - Logged in user information.
	 * @returns {JSON} - Created entity information.
	 */

	static add(queryParams, data, userDetails) {
		return new Promise(async (resolve, reject) => {
			try {
				// Find the entities document based on the entityType in queryParams

				let tenantId = userDetails.tenantAndOrgInfo.tenantId
				let orgId = userDetails.tenantAndOrgInfo.orgId[0]
				let entityTypeDocument = await entityTypeQueries.findOne(
					{ name: queryParams.type, tenantId: tenantId },
					{ _id: 1 }
				)
				if (!entityTypeDocument) {
					throw {
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					}
				}
				let entityDocuments = []
				let dataArray = Array.isArray(data) ? data : [data]

				for (let pointer = 0; pointer < dataArray.length; pointer++) {
					let singleEntity = dataArray[pointer]
					if (singleEntity.createdByProgramId) {
						singleEntity.createdByProgramId = ObjectId(singleEntity.createdByProgramId)
					}

					if (singleEntity.createdBySolutionId) {
						singleEntity.createdBySolutionId = ObjectId(singleEntity.solutionId)
					}

					// Prepare registryDetails based on singleEntity data
					let registryDetails = {}
					registryDetails['locationId'] = singleEntity.externalId
					registryDetails['code'] = singleEntity.externalId
					registryDetails['lastUpdatedAt'] = new Date()

					let childHierarchyPath = []
					if (Array.isArray(singleEntity.childHierarchyPath)) {
						// Fetch the valid childHierarchyPath from the entityType DB
						let validEntityType = await entityTypeQueries.entityTypesDocument(
							{
								// Use the "$in" operator to check if any of the entityType names are present in the 'childHierarchyPath' array
								name: {
									$in: singleEntity.childHierarchyPath,
								},
								tenantId: tenantId,
							},
							// Specify to return only the 'name' field of matching documents

							{ name: 1 }
						)

						// Create a mapping of names to their original index in childHierarchyPath
						const validatedChildHierarchy = singleEntity.childHierarchyPath.filter((name) =>
							validEntityType.some((entityType) => entityType.name === name)
						)
						// Convert the names in 'validatedChildHierarchy' to strings and assign them to 'childHierarchyPath'
						childHierarchyPath = validatedChildHierarchy.map(String)
					}
					singleEntity.targetedEntityTypes = Array.isArray(singleEntity.targetedEntityTypes)
						? await populateTargetedEntityTypesData(
								singleEntity.targetedEntityTypes.map((item) => item.trim()),
								tenantId
						  )
						: []
					// Construct the entity document to be created
					let entityDoc = {
						entityTypeId: entityTypeDocument._id,
						childHierarchyPath: childHierarchyPath,
						entityType: queryParams.type,
						registryDetails: registryDetails,
						groups: {},
						metaInformation: _.omit(singleEntity, ['locationId', 'code']),
						updatedBy: userDetails.userInformation.userId,
						createdBy: userDetails.userInformation.userId,
						userId: userDetails.userInformation.userId,
						tenantId: tenantId,
						orgId: orgId,
					}

					entityDocuments.push(entityDoc)
				}
				let entityData = await entitiesQueries.create(entityDocuments)

				let entities = []

				//update entity id in parent entity

				for (let eachEntityData = 0; eachEntityData < entityData.length; eachEntityData++) {
					if (queryParams.parentEntityId && queryParams.programId) {
						await this.addSubEntityToParent(
							queryParams.parentEntityId,
							entityData[eachEntityData]._id.toString(),
							queryParams.programId
						)
					}

					entities.push(entityData[eachEntityData]._id)
				}

				if (entityData.length != dataArray.length) {
					throw CONSTANTS.apiResponses.ENTITY_INFORMATION_NOT_INSERTED
				}

				// await this.pushEntitiesToElasticSearch(entities);

				return resolve(entityData)
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * details of the entities.
	 * @method
	 * @name details
	 * @param {ObjectId} entityId - entity Id.
	 * @param {Object} requestData - requested data.
	 * @param {String} language - language code.
	 * @param {Object} userDetails -  user decoded token details
	 * @returns {JSON} - provide the details.
	 */

	static details(entityId, requestData = {}, language, userDetails) {
		return new Promise(async (resolve, reject) => {
			try {
				let entityIds = []
				let externalIds = []

				let query = {}
				query['$or'] = []

				let queryToParent = {}
				queryToParent['$or'] = []

				// Prepare entityIds based on entityId and requestData
				if (UTILS.strictObjectIdCheck(entityId)) {
					entityIds.push(entityId)
				} else {
					externalIds.push(entityId)
				}
				if (requestData && requestData.entityIds) {
					entityIds.push(...requestData.entityIds)
				}

				// If entityIds are provided, search for matching _id fields
				if (entityIds.length > 0) {
					query['$or'].push({
						_id: {
							$in: entityIds,
						},
					})
				}
				// If no entityIds but externalIds are provided, search for matching externalId fields
				else if (externalIds.length > 0) {
					query['$or'].push({
						'metaInformation.externalId': {
							$in: externalIds,
						},
					})
				}
				// If neither entityIds nor externalIds are provided, throw an error
				else {
					throw {
						message: CONSTANTS.apiResponses.NOT_VALID_ID_AND_EXTERNALID,
					}
				}

				// If locationIds are provided in the request, add condition to match registryDetails.locationId
				if (requestData && requestData.locationIds) {
					query['$or'].push({
						'registryDetails.locationId': {
							$in: requestData.locationIds,
						},
					})
				}

				// If codes are provided in the request, add condition to match registryDetails.code
				if (requestData && requestData.codes) {
					query['$or'].push({
						'registryDetails.code': {
							$in: requestData.codes,
						},
					})
				}
				// add tenantId to the query
				query['tenantId'] = userDetails.userInformation.tenantId

				// Fetch entity documents based on constructed query
				let entityDocument = await entitiesQueries.entityDocuments(query, 'all')

				if (!entityDocument.length) {
					throw {
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					}
				}

				// Initialize variables for parent entity details
				let entityDocumentForParent
				let parentInformation = {}
				// Check if the first entity has _id and entityType to use for parent query
				if (entityDocument[0]._id && entityDocument[0].entityType) {
					const key = `groups.${entityDocument[0].entityType}`
					const queryToParent = {
						$or: [{ [key]: { $in: [entityDocument[0]._id] } }],
					}

					const projectionToParent = [
						'_id',
						'entityType',
						'metaInformation.name',
						'metaInformation.externalId',
						'translations',
					]

					entityDocumentForParent = await entitiesQueries.entityDocuments(
						queryToParent,
						projectionToParent,
						10
					)

					// Loop through each parent entity and structure their details into a categorized object
					entityDocumentForParent.map((entity) => {
						// Ensure required fields exist before processing
						if (entity.entityType && entity.metaInformation?.externalId && entity.metaInformation?.name) {
							if (!parentInformation[entity.entityType]) {
								parentInformation[entity.entityType] = []
							}
							// Decide the name based on language translations, fallback to default name
							let name
							if (entity.translations && entity.translations[language]) {
								name = entity.translations[language].name
							} else {
								name = entity.metaInformation.name
							}
							parentInformation[entity.entityType].push({
								_id: entity._id,
								externalId: entity.metaInformation.externalId,
								name: name,
							})
						}
					})
				}

				if (language) {
					// Map through entityDocument to update metaInformation name based on language
					entityDocument = entityDocument.map((document) => {
						if (document.translations && document.translations[language]) {
							document.metaInformation.name = document.translations[language].name
						}

						delete document.translations

						return document
					})
				} else {
					// Map through entityDocument to delete Translations
					entityDocument = entityDocument.map((document) => {
						delete document.translations
						return document
					})
				}

				// Push formatted parent entity info into the result object
				entityDocument = entityDocument.map((document) => {
					return {
						...document,
						parentInformation: parentInformation,
					}
				})
				if (entityDocument && entityDocument.length == 0) {
					return resolve({
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					})
				}

				resolve({
					message: CONSTANTS.apiResponses.ENTITY_INFORMATION_FETCHED,
					result: entityDocument,
				})
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Bulk create entities.
	 * @method
	 * @name bulkCreate
	 * @param {String} entityType - entity type.
	 * @param {String} programId - program external id.
	 * @param {String} solutionId - solution external id.
	 * @param {Object} userDetails - logged in user details.
	 * @param {String} userDetails.id - logged in user id.
	 * @param {Array}  entityCSVData - Array of entity data.
	 * @param {Array}  translationFile - Array of translation data.
	 * @returns {JSON} - uploaded entity information.
	 */
	static bulkCreate(entityType, programId, solutionId, userDetails, entityCSVData, translationFile) {
		return new Promise(async (resolve, reject) => {
			try {
				// let solutionsDocument = new Array()
				// if (programId && solutionId) {

				// 	solutionsDocument = await database.models.entityTypes
				// 		.find(
				// 			{
				// 				externalId: solutionId,
				// 				programExternalId: programId,
				// 			},
				// 			{
				// 				programId: 1,
				// 				externalId: 1,
				// 				subType: 1,
				// 				entityType: 1,
				// 				entityTypeId: 1,
				// 			}
				// 		)
				// 		.lean()
				// }

				// let solutionsData

				// if (solutionsDocument.length) {
				// 	solutionsData = solutionsDocument.reduce(
				// 		(ac, entities) => ({
				// 			...ac,
				// 			[entities.metaInformation.externalId]: {
				// 				subType: entities.subType,
				// 				solutionId: entities._id,
				// 				programId: entities.programId,
				// 				entityType: entities.entityType,
				// 				entityTypeId: entities.entityTypeId,
				// 				newEntities: new Array(),
				// 			},
				// 		}),
				// 		{}
				// 	)
				// }

				// Find the entity type document based on the provided entityType
				let tenantId = userDetails.tenantAndOrgInfo.tenantId
				let orgId = userDetails.tenantAndOrgInfo.orgId[0]
				let entityTypeDocument = await entityTypeQueries.findOne(
					{
						name: entityType,
						tenantId: tenantId,
					},
					{ _id: 1, tenantId: 1 }
				)
				if (!entityTypeDocument) {
					throw {
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.INVALID_ENTITY_TYPE,
					}
				}
				// Process each entity in the entityCSVData array to create new entities
				const entityUploadedData = await Promise.all(
					entityCSVData.map(async (singleEntity) => {
						singleEntity = UTILS.valueParser(singleEntity)
						addTagsInEntities(singleEntity)
						const userId =
							userDetails && userDetails.userInformation.userId
								? userDetails.userInformation.userId
								: CONSTANTS.common.SYSTEM
						let entityCreation = {
							entityTypeId: entityTypeDocument._id,
							entityType: entityType,
							registryDetails: {},
							groups: {},
							updatedBy: userId,
							createdBy: userId,
							tenantId: tenantId,
							orgId: orgId,
						}
						// if (singleEntity.allowedRoles && singleEntity.allowedRoles.length > 0) {
						// 	entityCreation['allowedRoles'] = await allowedRoles(singleEntity.allowedRoles)
						// 	delete singleEntity.allowedRoles
						// }
						let entityTypesArray = []
						if (singleEntity.targetedEntityTypes) {
							entityTypesArray = singleEntity.targetedEntityTypes
								.replace(/^"(.*)"$/, '$1') // remove starting and ending quotes
								.split(',')
								.map((type) => type.trim())
						}

						singleEntity.targetedEntityTypes =
							Array.isArray(entityTypesArray) && entityTypesArray.length > 0
								? await populateTargetedEntityTypesData(entityTypesArray, tenantId)
								: []

						if (singleEntity.childHierarchyPath) {
							entityCreation['childHierarchyPath'] = JSON.parse(singleEntity['childHierarchyPath'])
						}
						// Populate metaInformation by omitting keys starting with '_'
						entityCreation['metaInformation'] = _.omitBy(singleEntity, (value, key) => {
							return _.startsWith(key, '_')
						})

						if (!entityCreation.metaInformation.name || !entityCreation.metaInformation.externalId) {
							entityCreation.status = CONSTANTS.apiResponses.ENTITIES_FAILED
							entityCreation.message = CONSTANTS.apiResponses.FIELD_MISSING
							return entityCreation
						}

						if (entityCreation.metaInformation.externalId) {
							const externalId = entityCreation.metaInformation.externalId

							if (UTILS.strictObjectIdCheck(externalId)) {
								entityCreation.status = CONSTANTS.apiResponses.ENTITIES_FAILED
								entityCreation.message = CONSTANTS.apiResponses.NOT_A_VALID_MONGOID
								return entityCreation
							}

							entityCreation.registryDetails = {
								code: externalId,
								locationId: externalId,
							}
						}

						if (translationFile) {
							entityCreation['translations'] = translationFile[entityCreation.metaInformation.name]
						}

						// if (solutionsData && singleEntity._solutionId && singleEntity._solutionId != '')
						// 	singleEntity['createdByProgramId'] = solutionsData[singleEntity._solutionId]['programId']
						let newEntity = await entitiesQueries.create(entityCreation)
						if (!newEntity._id) {
							return
						}

						singleEntity['_SYSTEM_ID'] = newEntity._id.toString()

						if (singleEntity._SYSTEM_ID) {
							singleEntity.status = CONSTANTS.apiResponses.SUCCESS
							singleEntity.message = CONSTANTS.apiResponses.SUCCESS
						}

						// if (
						// 	solutionsData &&
						// 	singleEntity._solutionId &&
						// 	singleEntity._solutionId != '' &&
						// 	newEntity.entityType == solutionsData[singleEntity._solutionId]['entityType']
						// ) {
						// 	solutionsData[singleEntity._solutionId].newEntities.push(newEntity._id)
						// }

						// await this.pushEntitiesToElasticSearch([singleEntity["_SYSTEM_ID"]]);

						return singleEntity
					})
				)
				if (entityUploadedData.findIndex((entity) => entity === undefined) >= 0) {
					throw CONSTANTS.apiResponses.SOMETHING_WRONG_INSERTED_UPDATED
				}

				// solutionsData &&
				// 	(await Promise.all(
				// 		Object.keys(solutionsData).map(async (solutionExternalId) => {
				// 			if (solutionsData[solutionExternalId].newEntities.length > 0) {
				// 				await database.models.solutions.updateOne(
				// 					{ _id: solutionsData[solutionExternalId].solutionId },
				// 					{
				// 						$addToSet: {
				// 							entities: { $each: solutionsData[solutionExternalId].newEntities },
				// 						},
				// 					}
				// 				)
				// 			}
				// 		})
				// 	))

				return resolve(entityUploadedData)
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Bulk update entities.
	 * @method
	 * @name bulkUpdate
	 * @param {Object} userDetails - logged in user details.
	 * @param {Array} entityCSVData - Array of entity csv data to be updated.
	 * @param {Array}  translationFile - Array of translation data.
	 * @returns {Array} - Array of updated entity data.
	 */

	static bulkUpdate(entityCSVData, translationFile, userDetails) {
		return new Promise(async (resolve, reject) => {
			try {
				let tenantId = userDetails.tenantAndOrgInfo.tenantId
				const entityUploadedData = await Promise.all(
					entityCSVData.map(async (singleEntity) => {
						singleEntity = UTILS.valueParser(singleEntity)
						addTagsInEntities(singleEntity)

						// Check if '_SYSTEM_ID' is missing or invalid
						if (!singleEntity['_SYSTEM_ID'] || singleEntity['_SYSTEM_ID'] == '') {
							singleEntity['UPDATE_STATUS'] = CONSTANTS.apiResponses.INVALID_OR_MISSING_SYSTEM_ID
							return singleEntity
						}

						let updateData = {}
						updateData.registryDetails = {}

						Object.keys(singleEntity).forEach(function (key) {
							if (key.startsWith('registry-')) {
								let newKey = key.replace('registry-', '')
								updateData['registryDetails'][newKey] = singleEntity[key]
							}
						})

						if (updateData.registryDetails && Object.keys(updateData.registryDetails).length > 0) {
							entityCreation.registryDetails['code'] =
								entityCreation.registryDetails['code'] || entityCreation.externalId
							entityCreation.registryDetails['locationId'] =
								entityCreation.registryDetails['locationId'] || entityCreation.locationId
							updateData['registryDetails']['lastUpdatedAt'] = new Date()
						}

						// if (singleEntity.hasOwnProperty('allowedRoles')) {
						// 	updateData['allowedRoles'] = []
						// 	if (singleEntity.allowedRoles.length > 0) {
						// 		updateData['allowedRoles'] = await allowedRoles(singleEntity.allowedRoles)
						// 	}

						// 	delete singleEntity.allowedRoles
						// }

						let columnsToUpdate = _.omitBy(singleEntity, (value, key) => {
							return _.startsWith(key, '_')
						})

						Object.keys(columnsToUpdate).forEach((key) => {
							updateData[`metaInformation.${key}`] = columnsToUpdate[key]
						})

						if (!updateData['metaInformation.name'] || !updateData['metaInformation.externalId']) {
							singleEntity.status = CONSTANTS.apiResponses.ENTITIES_UPDATE_FAILED
							singleEntity.message = CONSTANTS.apiResponses.FIELD_MISSING
							return singleEntity
						}
						if (UTILS.strictObjectIdCheck(updateData['metaInformation.externalId'])) {
							singleEntity.status = CONSTANTS.apiResponses.ENTITIES_UPDATE_FAILED
							singleEntity.message = CONSTANTS.apiResponses.NOT_A_VALID_MONGOID
							return singleEntity
						}

						if (translationFile) {
							updateData['translations'] = translationFile[updateData['metaInformation.name']]
						}

						let targetedEntityTypes = entityCSVData[0].targetedEntityTypes
							.split(',')
							.map((item) => item.trim())

						updateData['metaInformation.targetedEntityTypes'] =
							Array.isArray(targetedEntityTypes) && targetedEntityTypes.length > 0
								? await populateTargetedEntityTypesData(targetedEntityTypes, tenantId)
								: []

						if (Object.keys(updateData).length > 0) {
							let updateEntity = await entitiesQueries.findOneAndUpdate(
								{ _id: singleEntity['_SYSTEM_ID'], tenantId: tenantId },
								{ $set: updateData },
								{ _id: 1 }
							)

							if (!updateEntity || !updateEntity._id) {
								singleEntity['status'] = CONSTANTS.apiResponses.ENTITY_NOT_FOUND
							} else {
								singleEntity['status'] = CONSTANTS.apiResponses.SUCCESS
								singleEntity['message'] = CONSTANTS.apiResponses.SUCCESS
							}
						} else {
							singleEntity['status'] = CONSTANTS.apiResponses.NO_INFORMATION_TO_UPDATE
						}

						return singleEntity
					})
				)

				// Check for any undefined values in entityUploadedData array
				if (entityUploadedData.findIndex((entity) => entity === undefined) >= 0) {
					throw CONSTANTS.apiResponses.SOMETHING_WRONG_INSERTED_UPDATED
				}

				return resolve(entityUploadedData)
			} catch (error) {
				return reject(error)
			}
		})
	}

	/**
	 * Update entity information.
	 * @method
	 * @name update
	 * @param {String} entityId - entity id.
	 * @param {Object} data - entity information that need to be updated.
	 * @param {Object} userDetails - loggedin user's info
	 * @returns {JSON} - Updated entity information.
	 */

	static update(entityId, bodyData, userDetails) {
		return new Promise(async (resolve, reject) => {
			try {
				let tenantId = userDetails.tenantAndOrgInfo.tenantId

				if (bodyData.translations) {
					// Fetch existing entity document
					let entityDocuments = await entitiesQueries.entityDocuments(
						{ _id: ObjectId(entityId), tenantId: tenantId },
						'all'
					)

					if (entityDocuments && entityDocuments.length > 0) {
						const existingTranslations = entityDocuments[0].translations || {}

						// Merge translations: Update only provided languages, keep the rest
						bodyData.translations = {
							...existingTranslations,
							...bodyData.translations,
						}
					}
				}

				if (bodyData['targetedEntityTypes']) {
					bodyData.targetedEntityTypes = bodyData.targetedEntityTypes.map((item) => item.trim())
					bodyData['metaInformation.targetedEntityTypes'] = await populateTargetedEntityTypesData(
						bodyData.targetedEntityTypes,
						tenantId
					)
					delete bodyData.targetedEntityTypes
				}
				// Update the entity using findOneAndUpdate
				let entityInformation = await entitiesQueries.findOneAndUpdate(
					{ _id: ObjectId(entityId), tenantId: tenantId },
					bodyData,
					{
						new: true,
					}
				)

				// Check if entityInformation is null (not found)
				if (!entityInformation) {
					return reject({ status: 404, message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND })
				}
				resolve({
					success: true,
					message: CONSTANTS.apiResponses.ENTITY_UPDATED,
					result: entityInformation,
				})
				// resolve({ entityInformation, message: CONSTANTS.apiResponses.ENTITYTYPE_UPDATED })
			} catch (error) {
				reject(error)
			}
		})
	}

	/**
	 * Default entities schema value.
	 * @method
	 * @name entitiesSchemaData
	 * @returns {JSON} List of entities schema.
	 */

	static entitiesSchemaData() {
		return {
			SCHEMA_ENTITY_OBJECT_ID: '_id',
			SCHEMA_ENTITY_TYPE_ID: 'entityTypeId',
			SCHEMA_ENTITIES: 'entities',
			SCHEMA_ENTITY_TYPE: 'entityType',
			SCHEMA_ENTITY_GROUP: 'groups',
			SCHEMA_METAINFORMATION: 'metaInformation',
			SCHEMA_ENTITY_CREATED_BY: 'createdBy',
		}
	}

	/**
	 * Default entities schema value.
	 * @method
	 * @name listEntitiesByType
	 * @returns {JSON} List of entities schema.
	 *  @param {Array} req - List of request
	 */

	static listEntitiesByType(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Retrieve the schema meta information key
				let schemaMetaInformation = this.entitiesSchemaData().SCHEMA_METAINFORMATION
				let tenantId = req.userDetails.userInformation.tenantId
				// Define projection for entity document fields to retrieve
				let projection = [
					schemaMetaInformation + '.externalId',
					schemaMetaInformation + '.name',
					'registryDetails.locationId',
				]

				// Calculate skipping value based on pagination parameters
				let skippingValue = req.pageSize * (req.pageNo - 1)

				// Query entities based on entity type ID
				let entityDocuments = await entitiesQueries.entityDocuments(
					{
						entityTypeId: ObjectId(req.params._id),
						tenantId: tenantId,
					},
					projection,
					req.pageSize,
					skippingValue,
					{
						[schemaMetaInformation + '.name']: 1,
					}
				)
				if (entityDocuments.length < 1) {
					throw {
						status: HTTP_STATUS_CODE.not_found.status,
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					}
				}

				// Map retrieved entity documents to desired format
				entityDocuments = entityDocuments.map((entityDocument) => {
					return {
						externalId: entityDocument.metaInformation.externalId,
						name: entityDocument.metaInformation.name,
						locationId:
							entityDocument.registryDetails && entityDocument.registryDetails.locationId
								? entityDocument.registryDetails.locationId
								: '',
						_id: entityDocument._id,
					}
				})

				resolve({
					success: true,
					message: CONSTANTS.apiResponses.ASSETS_FETCHED_SUCCESSFULLY,
					result: entityDocuments,
				})
			} catch (error) {
				reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * List entities.
	 * @method
	 * @name list
	 * @param {String} entityType - entity type.
	 * @param {String} entityId - requested entity id.
	 * @param {String} [limitingValue = ""] - Limiting value if required.
	 * @param {String} [skippingValue = ""] - Skipping value if required.
	 * @param {Object} userDetails - loggedin user's details
	 * @returns {JSON} - Details of entity.
	 */

	static list(
		entityType,
		entityId,
		limitingValue = '',
		skippingValue = '',
		schoolTypes = '',
		administrationTypes = '',
		userDetails
	) {
		return new Promise(async (resolve, reject) => {
			try {
				// Query for the specified entity type within the given entity type ID document
				let tenantId = userDetails.userInformation.tenantId
				let queryObject = { _id: ObjectId(entityId), tenantId: tenantId }
				let projectObject = { [`groups.${entityType}`]: 1 }
				let result = await entitiesQueries.findOne(queryObject, projectObject)
				if (!result) {
					return resolve({
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					})
				}
				// Check if the specified entity group within the document is present or not
				if (!result.groups || !result.groups[entityType]) {
					return resolve({
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.ENTITY_GROUPS_NOT_FOUND,
					})
				}

				// Extract entity IDs from the specified entity group
				let entityIds = result.groups[entityType]

				const entityTypesArray = await entityTypesHelper.list(
					{ tenantId: tenantId },
					{
						name: 1,
						immediateChildrenEntityType: 1,
					}
				)
				let enityTypeToImmediateChildrenEntityMap = {}

				// Build a map of entity types to their immediate child entity types
				if (entityTypesArray.length > 0) {
					entityTypesArray.forEach((entityType) => {
						enityTypeToImmediateChildrenEntityMap[entityType.name] =
							entityType.immediateChildrenEntityType && entityType.immediateChildrenEntityType.length > 0
								? entityType.immediateChildrenEntityType
								: []
					})
				}

				let filteredQuery = {
					$match: { _id: { $in: entityIds }, tenantId: tenantId },
				}

				let schoolOrAdministrationTypes = []

				if (schoolTypes !== '') {
					schoolOrAdministrationTypes = schoolOrAdministrationTypes.concat(schoolTypes.split(','))
				}

				if (administrationTypes !== '') {
					schoolOrAdministrationTypes = schoolOrAdministrationTypes.concat(administrationTypes.split(','))
				}

				if (schoolOrAdministrationTypes.length > 0) {
					schoolOrAdministrationTypes = schoolOrAdministrationTypes.map((schoolOrAdministrationType) =>
						schoolOrAdministrationType.toLowerCase()
					)

					filteredQuery['$match']['metaInformation.tags'] = { $in: schoolOrAdministrationTypes }
				}

				// Execute aggregation pipeline to retrieve and process entity data
				let entityData = await entitiesQueries.getAggregate([
					filteredQuery,
					{
						$project: {
							metaInformation: 1,
							groups: 1,
							entityType: 1,
							entityTypeId: 1,
						},
					},
					{
						$facet: {
							totalCount: [{ $count: 'count' }],
							data: [{ $skip: skippingValue }, { $limit: limitingValue }],
						},
					},
					{
						$project: {
							data: 1,
							count: {
								$arrayElemAt: ['$totalCount.count', 0],
							},
						},
					},
				])

				let count = 0
				result = []

				if (entityData[0].data.length > 0) {
					result = entityData[0].data.map((entity) => {
						// Calculate and add metadata to each entity
						entity.metaInformation.childrenCount = 0
						entity.metaInformation.entityType = entity.entityType
						entity.metaInformation.entityTypeId = entity.entityTypeId
						entity.metaInformation.subEntityGroups = new Array()

						entity.groups &&
							Array.isArray(enityTypeToImmediateChildrenEntityMap[entity.entityType]) &&
							enityTypeToImmediateChildrenEntityMap[entity.entityType].forEach(
								(immediateChildrenEntityType) => {
									if (entity.groups[immediateChildrenEntityType]) {
										entity.metaInformation.immediateSubEntityType = immediateChildrenEntityType
										entity.metaInformation.childrenCount =
											entity.groups[immediateChildrenEntityType].length
									}
								}
							)

						entity.groups &&
							Array.isArray(Object.keys(entity.groups)) &&
							Object.keys(entity.groups).forEach((subEntityType) => {
								entity.metaInformation.subEntityGroups.push(subEntityType)
							})
						return {
							_id: entity._id,
							entityId: entity._id,
							...entity.metaInformation,
						}
					})
					count = entityData[0].count
				}

				return resolve({
					message: CONSTANTS.apiResponses.ENTITY_INFORMATION_FETCHED,
					result: result,
					count: count,
				})
			} catch (error) {
				return reject(error)
			}
		})
	}
}

/**
 * Allowed roles in entities.
 * @method
 * @name allowedRoles
 * @param {Array} roles - Roles
 * @returns {Array} user roles
 */
// async function allowedRoles(roles) {
// 	return new Promise(async (resolve, reject) => {
// 		try {
// 			let userRoles = await userRolesHelper.list(
// 				{
// 					code: { $in: roles },
// 				},
// 				{
// 					code: 1,
// 				}
// 			)

// 			if (userRoles.length > 0) {
// 				userRoles = userRoles.map((userRole) => {
// 					return userRole.code
// 				})
// 			}

// 			return resolve(userRoles)
// 		} catch (error) {
// 			return reject(error)
// 		}
// 	})
// }

/**
 * Add tags in entity meta information.
 * @method
 * @name addTagsInEntities
 * @param {Object} entityMetaInformation - Meta information of the entity.
 * @returns {JSON} - entities metainformation consisting of scool types,administration types
 * and tags.
 */

function addTagsInEntities(entityMetaInformation) {
	// Convert and set school types to lowercase and assign them as tags
	if (entityMetaInformation.schoolTypes) {
		entityMetaInformation.schoolTypes = entityMetaInformation.schoolTypes.map((schoolType) =>
			schoolType.toLowerCase()
		)

		entityMetaInformation['tags'] = [...entityMetaInformation.schoolTypes]
	}

	// Convert and concatenate administration types with existing tags (if present)
	if (entityMetaInformation.administrationTypes) {
		entityMetaInformation.administrationTypes = entityMetaInformation.administrationTypes.map((schoolType) =>
			schoolType.toLowerCase()
		)

		if (entityMetaInformation.tags) {
			entityMetaInformation.tags = entityMetaInformation.tags.concat(entityMetaInformation.administrationTypes)
		} else {
			entityMetaInformation.tags = entityMetaInformation.administrationTypes
		}
	}
	return entityMetaInformation
}

async function populateTargetedEntityTypesData(targetedEntityTypes, tenantId) {
	try {
		const formattedTargetedEntityTypes = await entityTypeQueries.entityTypesDocument(
			{
				name: { $in: targetedEntityTypes },
				tenantId: tenantId,
			},
			['name', '_id']
		)

		formattedTargetedEntityTypes.forEach((entityType) => {
			entityType['entityTypeId'] = entityType._id.toString()
			entityType['entityType'] = entityType.name
			delete entityType._id
			delete entityType.name
		})
		return formattedTargetedEntityTypes
	} catch (err) {
		return []
	}
}
