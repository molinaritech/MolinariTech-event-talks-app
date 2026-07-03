import os
import requests
import feedparser
from flask import Flask, jsonify, render_template

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "cache_feed.xml"

def get_feed_data():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        # Try to fetch live feed
        response = requests.get(FEED_URL, headers=headers, timeout=10)
        if response.status_code == 200:
            feed = feedparser.parse(response.text)
            if feed.entries:
                return feed, "live"
            else:
                print("Live feed returned 0 entries. Falling back to local cache.")
        else:
            print(f"Live feed returned status code {response.status_code}. Falling back to local cache.")
    except Exception as e:
        print(f"Error fetching live feed: {e}. Falling back to local cache.")
        
    # Fallback to local cache file
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            feed = feedparser.parse(f.read())
            return feed, "cached"
            
    return None, "error"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/releases")
def api_releases():
    feed, source = get_feed_data()
    
    if not feed:
        return jsonify({
            "status": "error",
            "message": "Failed to retrieve release notes feed."
        }), 500
        
    entries = []
    for entry in feed.entries:
        # Extract content value
        content_val = ""
        if "content" in entry:
            content_val = entry.content[0].value
        elif "summary" in entry:
            content_val = entry.summary
            
        entries.append({
            "id": entry.get("id", ""),
            "title": entry.get("title", ""),
            "updated": entry.get("updated", entry.get("published", "")),
            "link": entry.get("link", ""),
            "content": content_val
        })
        
    return jsonify({
        "status": "success",
        "source": source,
        "feed_title": feed.feed.get("title", "BigQuery - Release notes"),
        "entries": entries
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)
