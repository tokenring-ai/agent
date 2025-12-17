# Complete Markdown Sample

## Headings

### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

## Text Formatting

This is **bold text** and this is *italic text*. Here's ***bold and italic*** combined.

This is ~~strikethrough text~~.

You can also use `inline code` within paragraphs.

---

## Lists

### Unordered Lists

- Item 1
- Item 2
 - Nested item 2.1
 - Nested item 2.2
  - Deeply nested item 2.2.1
- Item 3

### Ordered Lists

1. First item
2. Second item
 1. Nested ordered item 2.1
 2. Nested ordered item 2.2
3. Third item

### Mixed Lists

- Item A
 1. Sub-item A.1
 2. Sub-item A.2
- Item B
 1. Sub-item B.1

### Task Lists

- [x] Completed task
- [ ] Incomplete task
- [ ] Another incomplete task
 - [x] Sub-task completed
 - [ ] Sub-task incomplete

---

## Code Blocks

### JavaScript
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
  return name.toUpperCase();
}

greet("World");
```


### TypeScript
```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

function createUser(user: User): void {
  console.log(`User ${user.name} created`);
}
```


### Python
```textmate
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

for num in fibonacci(10):
    print(num)
```


### Bash
```shell script
#!/bin/bash
echo "Hello from bash!"
for i in {1..5}; do
    echo "Count: $i"
done
```


### SQL
```sql
SELECT users.name, COUNT(orders.id) as order_count
FROM users
LEFT JOIN orders ON users.id = orders.user_id
GROUP BY users.id
ORDER BY order_count DESC;
```


---

## Blockquotes

> This is a simple blockquote.

> This is a blockquote with **bold text** and *italic text*.
>
> It can span multiple paragraphs.
>
> > And it can contain nested blockquotes too!

---

## Tables

### Basic Table

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
| Cell 7   | Cell 8   | Cell 9   |

### Aligned Table

| Left Aligned | Center Aligned | Right Aligned |
|:-------------|:--------------:|--------------:|
| Left 1       |    Center 1    |       Right 1 |
| Left 2       |    Center 2    |       Right 2 |
| Left 3       |    Center 3    |       Right 3 |

### Complex Table

| Feature    | Supported | Version | Notes             |
|------------|:---------:|---------|-------------------|
| TypeScript |     ✓     | 5.9.3   | Full support      |
| React      |     ✓     | 19.0.0  | Latest version    |
| Express    |     ✓     | 4.21.2  | Backend framework |
| WebSocket  |     ✓     | 8.18.0  | Real-time comm    |
| Database   |     ✓     | Drizzle | ORM support       |

---

## Links and Images

### Links

[This is a link](https://www.example.com)

[Link with title](https://www.example.com "Example Site")

[Relative link](./path/to/file.md)

### Reference-style Links

[I'm a reference-style link][ref]

[I'm also a reference-style link][1]

[ref]: https://www.example.com
[1]: https://www.google.com

---

## Images

![Alt text for image](https://via.placeholder.com/150)

[![Image with link](https://via.placeholder.com/200)](https://www.example.com)

---

## Horizontal Rules

---

***

___

---

## Line Breaks and Spacing

This is line 1.  
This is line 2 (with two trailing spaces).

This is a new paragraph (with blank line above).

---

## Escaped Characters

\*Not italic\*

\[Not a link\]

\# Not a heading

---

## HTML Integration

<div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
  <h3>HTML Section</h3>
  <p>You can embed HTML in Markdown!</p>
</div>

---

## Footnotes

This is text with a footnote[^1].

[^1]: This is the footnote content.

---

## Definition Lists (HTML)

<dl>
  <dt>TypeScript</dt>
  <dd>A typed superset of JavaScript that compiles to plain JavaScript.</dd>

  <dt>React</dt>
  <dd>A JavaScript library for building user interfaces with components.</dd>

  <dt>Express</dt>
  <dd>A minimal and flexible Node.js web application framework.</dd>
</dl>

---

## Inline HTML

Here's a <span style="color: red;">red text</span> example using inline HTML.

---

## Special Formatting

### Superscript & Subscript

H<sub>2</sub>O is water.

E=mc<sup>2</sup>

### Keyboard Input

Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save.

---

## Emoji Support

😀 😃 😄 ✨ 🚀 💯 ⭐ 🎉

---
