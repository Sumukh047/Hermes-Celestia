import asyncio
from backend.tools import web_search, web_fetch

async def main():
    print('Testing search...')
    results = await web_search('AI Agents', max_results=1)
    print('Search result:', results)
    
    if results:
        print('Testing fetch on:', results[0]['url'])
        page = await web_fetch(results[0]['url'], max_chars=200)
        print('Fetch result status:', page['status'])

asyncio.run(main())
