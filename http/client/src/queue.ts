export class Queue<T> {
    private items: T[];

    constructor() {
        this.items = [];
    }

    // Add an element to the back of the queue
    enqueue(element: T): void {
        this.items.push(element);
    }

    // Remove and return the element from the front of the queue
    dequeue(): T | undefined {
        if (this.isEmpty()) {
            return undefined; // Or throw an error
        }
        return this.items.shift();
    }

    // Return the element at the front of the queue without removing it
    peek(): T | undefined {
        if (this.isEmpty()) {
            return undefined;
        }
        return this.items[0];
    }

    // Check if the queue is empty
    isEmpty(): boolean {
        return this.items.length === 0;
    }

    // Get the number of elements in the queue
    size(): number {
        return this.items.length;
    }

    // Clear the queue
    clear(): void {
        this.items = [];
    }
}

// // Usage example
// const myQueue = new Queue<string>();
// myQueue.enqueue("first");
// myQueue.enqueue("second");
// console.log(myQueue.dequeue()); // Outputs: "first"
// console.log(myQueue.peek());    // Outputs: "second"
// myQueue.enqueue("third");
// console.log(myQueue.size());    // Outputs: 2
// console.log(myQueue.dequeue()); // Outputs: "second"
// console.log(myQueue.dequeue()); // Outputs: "third"
// console.log(myQueue.isEmpty()); // Outputs: true