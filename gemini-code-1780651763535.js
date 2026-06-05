const mangayomiSources = [{
    "name": "AllManga",
    "lang": "en",
    "baseUrl": "https://allmanga.to",
    "apiUrl": "https://api.allmanga.to/api", // AllManga's backend API route
    "iconUrl": "https://allmanga.to/favicon.ico",
    "typeSource": "single",
    "isManga": true,
    "isNsfw": true, // Set to true if the site includes mature series
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "en",
    "pkgPath": "manga/src/en/allmanga.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiHeaders = {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json',
            'origin': 'https://allmanga.to',
            'referer': 'https://allmanga.to/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        };
    }

    parseStatus(status) {
        if (!status) return 5;
        const s = status.toLowerCase();
        if (s.includes("ongoing")) return 0;
        if (s.includes("completed")) return 1;
        if (s.includes("hiatus") || s.includes("paused")) return 2;
        if (s.includes("dropped") || s.includes("cancelled")) return 3;
        if (s.includes("coming soon") || s.includes("upcoming")) return 4;
        return 5;
    }

    async parseMangaList(url) {
        const res = await this.client.get(url, this.apiHeaders);
        const json = JSON.parse(res.body);
        
        // Map according to AllManga's specific JSON structure
        let mangas = json.data.map(manga => ({
            name: manga.title || manga.name,
            imageUrl: manga.thumbnail || manga.coverUrl,
            link: manga.slug || manga._id
        }));

        // Determine if there is a next page based on total limits or a boolean flag
        const hasNextPage = json.meta ? json.meta.has_next_page : (mangas.length >= 20);
        return { "list": mangas, "hasNextPage": hasNextPage };
    }

    async getPopular(page) {
        // Assume API endpoint for popular items sorted by views/rating
        return await this.parseMangaList(`${this.source.apiUrl}/mangas?page=${page}&sort=popular`);
    }

    async getLatestUpdates(page) {
        // Assume API endpoint for recently updated items
        return await this.parseMangaList(`${this.source.apiUrl}/mangas?page=${page}&sort=latest`);
    }

    async search(query, page, filters) {
        let url = `${this.source.apiUrl}/mangas?page=${page}`;
        
        if (query) {
            url += `&search=${encodeURIComponent(query)}`;
        }

        // If no filters are provided, return the basic search
        if (!filters || filters.length === 0) {
            return await this.parseMangaList(url);
        }

        // Apply Genre Filters (Index 0)
        let includedGenres = [];
        let excludedGenres = [];
        for (const filter of filters[0].state) {
            if (filter.state === 1) includedGenres.push(filter.value);
            else if (filter.state === 2) excludedGenres.push(filter.value);
        }
        if (includedGenres.length > 0) url += `&genres=${includedGenres.join(',')}`;
        if (excludedGenres.length > 0) url += `&exclude_genres=${excludedGenres.join(',')}`;

        // Apply Status Filter (Index 1)
        for (const filter of filters[1].state) {
            if (filter.state === true) url += `&status=${filter.value}`;
        }

        // Apply Sort Filter (Index 2)
        const sortVal = filters[2].values[filters[2].state.index].value;
        const sortOrder = filters[2].state.ascending ? 'asc' : 'desc';
        if (sortVal) url += `&sort=${sortVal}&order=${sortOrder}`;

        return await this.parseMangaList(url);
    }

    async getDetail(url) {
        // Fetch manga info and chapters
        const infoRes = await this.client.get(`${this.source.apiUrl}/manga/${url}`, this.apiHeaders);
        const chapterRes = await this.client.get(`${this.source.apiUrl}/manga/${url}/chapters`, this.apiHeaders);
        
        const info = JSON.parse(infoRes.body).data;
        const chapters = JSON.parse(chapterRes.body).data;
        
        return {
            name: info.title,
            imageUrl: info.thumbnail || info.coverUrl,
            author: info.authors ? info.authors.join(', ') : "Unknown",
            artist: info.artists ? info.artists.join(', ') : "Unknown",
            status: this.parseStatus(info.status),
            description: info.description || info.synopsis,
            genre: info.genres ? info.genres.map(x => (typeof x === 'string' ? x : x.name)) : [],
            chapters: chapters.map(c => ({
                name: c.title ? `Chapter ${c.chapter}: ${c.title}` : `Chapter ${c.chapter}`,
                url: `${this.source.apiUrl}/chapter/${c._id || c.slug}`, // Endpoint to fetch chapter images
                dateUpload: new Date(c.createdAt || c.releaseDate).valueOf().toString(),
                scanlator: c.scanlator || "AllManga"
            })).reverse() // Usually chapters are displayed newest to oldest
        };
    }

    async getPageList(url) {
        const serverId = new SharedPreferences().get('imageServer') || 'main';

        const res = await this.client.get(url, this.apiHeaders);
        const chapterData = JSON.parse(res.body).data;
        
        // Pick the right image server based on user preferences
        let serverUrl = "";
        if (serverId === 'main' && chapterData.serverMain) {
             serverUrl = chapterData.serverMain;
        } else if (serverId === 'alt' && chapterData.serverAlt) {
             serverUrl = chapterData.serverAlt;
        }

        return chapterData.pages.map(img => ({
            url: img.startsWith('http') ? img : serverUrl + img,
            headers: this.apiHeaders
        }));
    }

    getFilterList() {
        return [
            {
                type_name: "GroupFilter",
                type: "genres",
                name: "Genres",
                state: [
                    ["Action", "action"],
                    ["Adventure", "adventure"],
                    ["Comedy", "comedy"],
                    ["Drama", "drama"],
                    ["Fantasy", "fantasy"],
                    ["Horror", "horror"],
                    ["Isekai", "isekai"],
                    ["Martial Arts", "martial-arts"],
                    ["Psychological", "psychological"],
                    ["Romance", "romance"],
                    ["Sci-fi", "sci-fi"],
                    ["Seinen", "seinen"],
                    ["Shoujo", "shoujo"],
                    ["Shounen", "shounen"],
                    ["Slice of Life", "slice-of-life"],
                    ["Tragedy", "tragedy"]
                ].map(x => ({ type_name: 'TriState', name: x[0], value: x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "status",
                name: "Status",
                state: [
                    ["Ongoing", "ongoing"],
                    ["Completed", "completed"],
                    ["Hiatus", "hiatus"],
                    ["Dropped", "dropped"]
                ].map(x => ({ type_name: 'CheckBox', name: x[0], value: x[1] }))
            },
            {
                type_name: "SortFilter",
                type: "sort",
                name: "Sort By",
                state: {
                    type_name: "SortState",
                    index: 0,
                    ascending: false
                },
                values: [
                    ['Popularity', 'popular'],
                    ['Latest Updates', 'latest'],
                    ['Alphabetical (A-Z)', 'alphabetical'],
                    ['Rating', 'rating'],
                    ['Views', 'views']
                ].map(x => ({ type_name: 'SelectOption', name: x[0], value: x[1] }))
            }
        ];
    }

    getSourcePreferences() {
        const imageServers = ['Main Server', 'Alternative Server'];
        const imageServerValues = ['main', 'alt'];
        return [
            {
                key: 'imageServer',
                listPreference: {
                    title: 'Image Server',
                    summary: 'Select the server to fetch chapter images from.',
                    valueIndex: 0,
                    entries: imageServers,
                    entryValues: imageServerValues
                }
            }
        ];
    }
}