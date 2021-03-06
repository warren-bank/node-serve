module.exports = {
	type: 'object',
	properties: {
		'public': {
			type: 'string'
		},
		'cleanUrls': {
			type: [
				'boolean',
				'array'
			]
		},
		'rewrites': {
			type: 'array'
		},
		'redirects': {
			type: 'array'
		},
		'cgiBin': {
			type: 'array'
		},
		'proxyMiddleware': {
			type: 'array'
		},
		'proxyCookieJar': {
			type: 'string'
		},
		'headers': {
			type: 'array',
			maxItems: 50,
			minItems: 1,
			uniqueItems: true,
			items: {
				type: 'object',
				required: ['source', 'headers'],
				properties: {
					source: {
						type: 'string',
						minLength: 1,
						maxLength: 100
					},
					headers: {
						type: 'array',
						maxItems: 50,
						minItems: 1,
						uniqueItems: true,
						items: {
							type: 'object',
							required: ['key', 'value'],
							properties: {
								'key': {
									type: 'string',
									minLength: 1,
									maxLength: 128
								},
								'value': {
									type: 'string',
									nullable: true,
									minLength: 1,
									maxLength: 2048
								}
							},
							additionalProperties: false
						}
					}
				},
				additionalProperties: false
			}
		},
		'directoryListing': {
			type: [
				'boolean',
				'array'
			]
		},
		'unlisted': {
			type: 'array'
		},
		'trailingSlash': {
			type: 'boolean'
		},
		'renderSingle': {
			type: 'boolean'
		},
		'symlinks': {
			type: 'boolean'
		},
		'etag': {
			type: 'boolean'
		},
		'auth': {
			type: 'object',
			required: ['name', 'pass'],
			properties: {
				'name': {
					type: 'string',
					minLength: 1,
					maxLength: 255
				},
				'pass': {
					type: 'string',
					minLength: 1,
					maxLength: 255
				}
			},
			additionalProperties: false
		},
		'logReq': {
			type: 'boolean'
		},
		'logRes': {
			type: 'boolean'
		}
	},
	additionalProperties: false
};
