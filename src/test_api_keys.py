"""
Test all API keys to verify they work correctly.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent.parent / ".env")


def test_openai():
    """Test OpenAI API with a simple embedding request."""
    print("Testing OpenAI API...")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key.startswith("sk-..."):
        print("  ❌ OPENAI_API_KEY not set")
        return False

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        response = client.embeddings.create(
            model="text-embedding-3-small",
            input="Hello, this is a test."
        )

        embedding = response.data[0].embedding
        print(f"  ✅ OpenAI API working! Got embedding with {len(embedding)} dimensions")
        return True

    except Exception as e:
        print(f"  ❌ OpenAI API error: {e}")
        return False


def test_google_maps():
    """Test Google Maps API with geocoding and places requests."""
    print("Testing Google Maps API...")

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key or api_key.startswith("AIza..."):
        print("  ❌ GOOGLE_MAPS_API_KEY not set")
        return False

    import requests

    # Test Geocoding API
    print("  Testing Geocoding API...")
    geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": "Queenstown, New Zealand",
        "key": api_key
    }

    try:
        resp = requests.get(geocode_url, params=params, timeout=10)
        data = resp.json()

        if data.get("status") == "OK":
            location = data["results"][0]["geometry"]["location"]
            print(f"  ✅ Geocoding API working! Queenstown: ({location['lat']:.4f}, {location['lng']:.4f})")
        elif data.get("status") == "REQUEST_DENIED":
            print(f"  ❌ Geocoding API denied: {data.get('error_message', 'Unknown error')}")
            print("     -> Enable 'Geocoding API' in Google Cloud Console")
            return False
        else:
            print(f"  ❌ Geocoding API error: {data.get('status')} - {data.get('error_message')}")
            return False

    except Exception as e:
        print(f"  ❌ Geocoding API error: {e}")
        return False

    # Test Places API (place details)
    print("  Testing Places API...")
    places_url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
    params = {
        "input": "Sky Tower Auckland",
        "inputtype": "textquery",
        "fields": "name,geometry",
        "key": api_key
    }

    try:
        resp = requests.get(places_url, params=params, timeout=10)
        data = resp.json()

        if data.get("status") == "OK":
            place = data["candidates"][0]
            loc = place["geometry"]["location"]
            print(f"  ✅ Places API working! {place['name']}: ({loc['lat']:.4f}, {loc['lng']:.4f})")
            return True
        elif data.get("status") == "REQUEST_DENIED":
            print(f"  ❌ Places API denied: {data.get('error_message', 'Unknown error')}")
            print("     -> Enable 'Places API' in Google Cloud Console")
            return False
        else:
            print(f"  ❌ Places API error: {data.get('status')} - {data.get('error_message')}")
            return False

    except Exception as e:
        print(f"  ❌ Places API error: {e}")
        return False


def test_anthropic():
    """Test Anthropic API with a simple completion request."""
    print("Testing Anthropic API...")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or api_key.startswith("sk-ant-..."):
        print("  ⚠️  ANTHROPIC_API_KEY not set (optional)")
        return True  # Optional, so don't fail

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=50,
            messages=[{"role": "user", "content": "Say 'API test successful' and nothing else."}]
        )

        text = response.content[0].text
        print(f"  ✅ Anthropic API working! Response: {text[:50]}")
        return True

    except Exception as e:
        print(f"  ❌ Anthropic API error: {e}")
        return False


def main():
    print("=" * 60)
    print("API KEY VERIFICATION")
    print("=" * 60)
    print()

    results = {
        "OpenAI": test_openai(),
        "Google Maps": test_google_maps(),
        "Anthropic": test_anthropic(),
    }

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)

    all_passed = True
    for name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {name}: {status}")
        if not passed and name != "Anthropic":  # Anthropic is optional
            all_passed = False

    print()
    if all_passed:
        print("All required APIs are working! Ready to proceed.")
        return 0
    else:
        print("Some APIs failed. Please check the errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
